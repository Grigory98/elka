package ssh

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"elka-desktop/backend/internal/apperror"
)

// Мониторинг нужен только для вкладки, которую смотрят прямо сейчас, поэтому на сессию заводится
// один дополнительный канал, а фонового сбора по всем сессиям нет.
const metricsSnapshotMarker = "@elka-metrics@"

// Ждать соединения приходится из-за порядка событий на фронте: вкладка появляется в списке раньше,
// чем готов SSH-клиент, и первый вызов StartMetrics без ожидания уходил в пустоту.
const (
	sessionWaitTimeout = 15 * time.Second
	sessionWaitStep    = 200 * time.Millisecond
)

// Снимок собирается только чтением /proc плюс df для корневого раздела: запуск top или vmstat раз в
// секунду на чужой машине заметно дороже. Всю арифметику берёт на себя Go.
//
// Строчный формат не фиксирован: каждая строка разбирается по первым полям, лишний вывод от
// login-скриптов пропускается.
const metricsSnapshotCommand = `while :; do
head -n 1 /proc/stat
cat /proc/loadavg
cat /proc/uptime
grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree)' /proc/meminfo
awk 'NR>2 && $1 != "lo:" {rx+=$2; tx+=$10} END {print "net", rx+0, tx+0}' /proc/net/dev
df -P / | tail -n 1
printf '%s\n' '` + metricsSnapshotMarker + `' 
sleep 1
done`

// ServerMetrics — проценты и скорости, а не сырые счётчики: их уже не нужно считать на фронте.
// Отрицательное значение означает «показатель недоступен», чтобы ноль и пробел не путались.
type ServerMetrics struct {
	CPU    float64
	IOWait float64
	// Load average как в top: за минуту, пять и пятнадцать минут, без пересчёта на ядра.
	Load1  float64
	Load5  float64
	Load15 float64
	Memory float64
	Swap   float64
	Disk   float64
	// Сеть в байтах на секунду, суммой по всем интерфейсам кроме петли.
	NetworkIn  float64
	NetworkOut float64
	// Время работы в секундах.
	Uptime float64
	// Сколько процессов сейчас в работе и сколько всего на сервере.
	ProcessesRunning float64
	ProcessesTotal   float64
}

func newServerMetrics() ServerMetrics {
	return ServerMetrics{
		CPU: -1, IOWait: -1, Load1: -1, Load5: -1, Load15: -1, Memory: -1, Swap: -1, Disk: -1,
		NetworkIn: -1, NetworkOut: -1, Uptime: -1,
		ProcessesRunning: -1, ProcessesTotal: -1,
	}
}

// metricsSample — состояние системы в один момент времени. Проценты CPU и скорость сети считаются
// между двумя снимками, поэтому счётчики нужно помнить.
type metricsSample struct {
	total     float64
	busy      float64
	ioWait    float64
	load1     float64
	load5     float64
	load15    float64
	memTotal  float64
	memFree   float64
	swapTotal float64
	swapFree  float64
	netIn     float64
	netOut    float64
	uptime    float64
	running   float64
	processes float64
	diskUsed  float64

	hasCPU       bool
	hasLoad      bool
	hasMemory    bool
	hasSwap      bool
	hasNet       bool
	hasUptime    bool
	hasProcesses bool
	hasDisk      bool
}

// metrics переводит два соседних снимка в готовые значения. Первый снимок не годится: для CPU и сети
// нужна дельта, поэтому возвращает false и ничего не слажет.
func (s metricsSample) metrics(previous metricsSample) (ServerMetrics, bool) {
	if !previous.hasCPU || !s.hasCPU {
		return ServerMetrics{}, false
	}

	values := newServerMetrics()
	if delta := s.total - previous.total; delta > 0 {
		values.CPU = percentage(s.busy-previous.busy, delta)
		values.IOWait = percentage(s.ioWait-previous.ioWait, delta)
	} else {
		// Счётчики уменьшаются только при перезагрузке или смене ядер: дельты нет, но и «нет
		// данных» тут быть не должно.
		values.CPU = 0
		values.IOWait = 0
	}
	// Load average показывается как есть: пересчёт на ядра прятал бы смысл, из-за которого его и
	// смотрят в top.
	if s.hasLoad {
		values.Load1 = s.load1
		values.Load5 = s.load5
		values.Load15 = s.load15
	}
	if s.hasMemory && s.memTotal > 0 {
		values.Memory = percentage(s.memTotal-s.memFree, s.memTotal)
	}
	// Swap считается так же, как память, но процент от SwapTotal, а не от всей памяти.
	if s.hasSwap && s.swapTotal > 0 {
		values.Swap = percentage(s.swapTotal-s.swapFree, s.swapTotal)
	}
	if s.hasDisk {
		values.Disk = s.diskUsed
	}
	// Сеть тоже требует дельты, а делить приходится на реально прошедшее время: sleep в цикле
	// отрабатывает не ровно раз в секунду.
	if s.hasNet && previous.hasNet && s.hasUptime && previous.hasUptime {
		if seconds := s.uptime - previous.uptime; seconds > 0 {
			values.NetworkIn = ((s.netIn - previous.netIn) / seconds)
			values.NetworkOut = ((s.netOut - previous.netOut) / seconds)
		}
	}
	if s.hasUptime {
		values.Uptime = s.uptime
	}
	if s.hasProcesses {
		values.ProcessesRunning = s.running
		values.ProcessesTotal = s.processes
	}

	// Чего сервер не отдал, остаётся с минусом: панель покажет прочерк, а не правдоподобный ноль.
	return values, true
}

// parseSnapshot разбирает строки одного снимка. Неизвестные строки пропускаются, чтобы лишний вывод
// не ломал счётчики.
func parseSnapshot(lines []string) metricsSample {
	sample := metricsSample{}
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		switch fields[0] {
		case "cpu":
			sample.addCPU(fields[1:])
		case "net":
			sample.addNetwork(fields[1:])
		case "MemTotal:":
			sample.memTotal = parseFloat(fieldAt(fields, 1))
		case "MemAvailable:":
			// В части контейнеров MemAvailable нет, и без него память нечего считать.
			sample.memFree = parseFloat(fieldAt(fields, 1))
			sample.hasMemory = sample.memTotal > 0 && sample.memFree > 0
		case "SwapTotal:":
			sample.swapTotal = parseFloat(fieldAt(fields, 1))
		case "SwapFree:":
			sample.swapFree = parseFloat(fieldAt(fields, 1))
			sample.hasSwap = sample.swapTotal > 0
		default:
			sample.addBareLine(fields)
		}
	}
	return sample
}

// addBareLine разбирает строки без имени источника: /proc/loadavg, /proc/uptime и df.
func (s *metricsSample) addBareLine(fields []string) {
	switch {
	case len(fields) >= 4 && isNumeric(fields[0]) && strings.Contains(fields[3], "/"):
		// /proc/loadavg: три значения загрузки за 1, 5 и 15 минут, затем running/total и pid.
		s.load1 = parseFloat(fields[0])
		s.load5 = parseFloat(fields[1])
		s.load15 = parseFloat(fields[2])
		running, total, _ := strings.Cut(fields[3], "/")
		s.running = parseFloat(running)
		s.processes = parseFloat(total)
		s.hasLoad = true
		s.hasProcesses = true
	case len(fields) >= 2 && isNumeric(fields[0]) && isNumeric(fields[1]):
		// /proc/uptime: секунды, затем нагрузка. Второе поле отбрасываем.
		s.uptime = parseFloat(fields[0])
		s.hasUptime = true
	case len(fields) >= 5 && strings.HasSuffix(fields[len(fields)-2], "%"):
		// df -P /: имя, размер, занято, свободно, процент, точка монтирования.
		s.diskUsed = clamp(parseFloat(strings.TrimSuffix(fields[len(fields)-2], "%")))
		s.hasDisk = true
	}
}

func (s *metricsSample) addNetwork(fields []string) {
	if len(fields) < 2 {
		return
	}
	s.netIn = parseFloat(fields[0])
	s.netOut = parseFloat(fields[1])
	s.hasNet = true
}

// addCPU раскладывает строку cpu из /proc/stat. В ней user+nice+system+idle+iowait+irq+softirq+steal
// идут первыми восемью, а guest с guest_nice уже учтены в user и nice, поэтому в сумму не входят.
func (s *metricsSample) addCPU(fields []string) {
	values := make([]float64, 0, 8)
	for _, field := range fields {
		value, err := strconv.ParseFloat(field, 64)
		if err != nil {
			break
		}
		values = append(values, value)
		if len(values) == 8 {
			break
		}
	}
	if len(values) < 4 {
		return
	}

	s.hasCPU = true
	s.total = sum(values)
	// idle и iowait считаются занятыми: iowait показывается отдельной строкой, но для загрузки CPU
	// это время, в которое процессор ничего не делал.
	s.busy = s.total - values[3] - values[4]
	s.ioWait = values[4]
}

// StartMetrics открывает на уже установленном соединении второй канал и начинает раз в секунду
// присылать метрики сервера. Повторный вызов для той же сессии ничего не меняет, чтобы переходы
// между вкладками не плодили каналы.
//
// Фронтенд зовёт метод сразу после открытия вкладки, когда соединение ещё только набирается, поэтому
// отсутствие сессии — не ошибка, а повод подождать: без этого ожидания первый запуск молча терялся, и
// метрики появлялись только после переключения настройки.
func (s *SshService) StartMetrics(sessionID string) error {
	deadline := time.Now().Add(sessionWaitTimeout)
	for {
		active, running := s.metricsTarget(sessionID)
		if running {
			return nil
		}
		if active != nil {
			return s.startMetricsOn(sessionID, active)
		}
		if time.Now().After(deadline) {
			return apperror.SSHSessionNotFound()
		}
		time.Sleep(sessionWaitStep)
	}
}

// metricsTarget возвращает сессию, у которой можно завести канал, и признак того, что сбор по ней уже
// идёт.
func (s *SshService) metricsTarget(sessionID string) (*activeSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	active, exists := s.sessions[sessionID]
	if !exists || active == nil || active.client == nil {
		return nil, false
	}
	return active, active.metricsChannel != nil
}

// startMetricsOn заводит канал на готовой сессии. Пока канал открывался, сессия могла закрыться или
// мониторинг успели включить снова — тогда ничего трогать нельзя.
func (s *SshService) startMetricsOn(sessionID string, active *activeSession) error {
	channel, err := active.client.NewSession()
	if err != nil {
		return fmt.Errorf("open the metrics channel: %w", err)
	}
	// StdoutPipe обязан идти до Start: после запуска команды канал считает Stdout занятым.
	stdout, err := channel.StdoutPipe()
	if err != nil {
		_ = channel.Close()
		return fmt.Errorf("read the metrics stream: %w", err)
	}
	if err := channel.Start(metricsSnapshotCommand); err != nil {
		_ = channel.Close()
		return fmt.Errorf("start collecting metrics: %w", err)
	}

	s.mu.Lock()
	if current, still := s.sessions[sessionID]; !still || current != active || current.metricsChannel != nil {
		s.mu.Unlock()
		_ = channel.Close()
		return nil
	}
	active.metricsChannel = channel
	s.mu.Unlock()

	go s.streamMetrics(sessionID, stdout, channel, active)
	return nil
}

// StopMetrics закрывает канал сбора. Закрытие обрывает цикл на сервере, иначе та команда continue
// будет крутиться там до конца сессии.
func (s *SshService) StopMetrics(sessionID string) error {
	s.mu.Lock()
	active, exists := s.sessions[sessionID]
	if !exists || active == nil || active.metricsChannel == nil {
		s.mu.Unlock()
		return nil
	}
	channel := active.metricsChannel
	active.metricsChannel = nil
	s.mu.Unlock()

	_ = channel.Close()
	return nil
}

// streamMetrics читает снимки и отдаёт готовые значения. Канал закрывается при уходе со вкладки, обрыве
// связи или закрытии сессии, и цикл сбора на сервере завершается вместе с ним.
func (s *SshService) streamMetrics(sessionID string, stdout io.Reader, channel *ssh.Session, current *activeSession) {
	defer func() {
		s.mu.Lock()
		if active, exists := s.sessions[sessionID]; exists && active == current && active.metricsChannel == channel {
			active.metricsChannel = nil
		}
		s.mu.Unlock()
		_ = channel.Close()
	}()

	var previous metricsSample
	var pending []string
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		fields := strings.Fields(line)
		if len(fields) > 0 && fields[0] == metricsSnapshotMarker {
			// Сторож замыкает снимок и несёт с собой число ядер.
			sample := parseSnapshot(pending)
			if metrics, ok := sample.metrics(previous); ok {
				s.emitter.EmitMetrics(sessionID, metrics)
			}
			previous = sample
			pending = pending[:0]
			continue
		}
		pending = append(pending, line)
	}
}

func fieldAt(fields []string, index int) string {
	if index >= len(fields) {
		return ""
	}
	return fields[index]
}

func parseFloat(field string) float64 {
	value, err := strconv.ParseFloat(field, 64)
	if err != nil {
		return 0
	}
	return value
}

func isNumeric(field string) bool {
	_, err := strconv.ParseFloat(field, 64)
	return err == nil
}

func sum(values []float64) float64 {
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total
}

func percentage(part, whole float64) float64 {
	if whole <= 0 {
		return 0
	}
	return clamp(part / whole * 100)
}

func clamp(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

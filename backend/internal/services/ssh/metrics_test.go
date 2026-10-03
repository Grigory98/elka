package ssh

import (
	"math"
	"strings"
	"testing"
)

func snapshot(lines ...string) []string { return lines }

func TestPercentagesFromTwoSnapshots(t *testing.T) {
	// Снимки как их отдаёт /proc: счётчики монотонно растут между замерами.
	first := parseSnapshot(snapshot(
		"cpu  1000 20 300 8000 100 0 50 0 0 0",
		"1.50 1.20 1.00 2/512 4242",
		"MemTotal:       1000000 kB",
		"MemAvailable:    250000 kB",
	))

	second := parseSnapshot(snapshot(
		"cpu  1100 20 350 8600 200 0 50 0 0 0",
		"3.00 1.40 1.10 2/512 4242",
		"MemTotal:       1000000 kB",
		"MemAvailable:    400000 kB",
	))

	metrics, ok := second.metrics(first)
	if !ok {
		t.Fatal("the second snapshot produced no metrics")
	}

	// total вырос на 850: user +100, system +50, idle +600, iowait +100, steal без изменений.
	assertClose(t, "cpu", metrics.CPU, 150.0/850.0*100)
	assertClose(t, "io wait", metrics.IOWait, 100.0/850.0*100)
	// Загрузка второго снимка показывается как есть: 3.00, 1.40 и 1.10 из loadavg.
	assertClose(t, "load 1m", metrics.Load1, 3.00)
	assertClose(t, "load 5m", metrics.Load5, 1.40)
	assertClose(t, "load 15m", metrics.Load15, 1.10)
	// Занято 1000000 - 400000 из 1000000.
	assertClose(t, "memory", metrics.Memory, 60)
}

func TestFirstSnapshotHasNoRates(t *testing.T) {
	first := parseSnapshot(snapshot("cpu  1000 20 300 8000 100 0 50 0 0 0"))
	if _, ok := first.metrics(metricsSample{}); ok {
		t.Error("rates were computed without a previous snapshot")
	}
}

func TestGuestTimeIsNotCountedTwice(t *testing.T) {
	// guest и guest_nice уже входят в user и nice, поэтому сумма должна остаться прежней.
	withGuest := parseSnapshot(snapshot("cpu  1000 20 300 8000 100 0 50 0 400 300"))
	without := parseSnapshot(snapshot("cpu  1000 20 300 8000 100 0 50"))
	if withGuest.total != without.total {
		t.Errorf("total = %v with guest fields, %v without", withGuest.total, without.total)
	}
}

func TestPercentagesSurviveCounterJump(t *testing.T) {
	// Счётчики /proc только растут, но после перезагрузки или смены ядер cpu может прийти не с того.
	first := parseSnapshot(snapshot("cpu  1000 0 0 1000 0 0 0", "0.00 0.00 0.00 1/1 1"))
	second := parseSnapshot(snapshot("cpu  10 0 0 10 0 0 0", "0.00 0.00 0.00 1/1 1"))

	metrics, ok := second.metrics(first)
	if !ok {
		t.Fatal("no metrics")
	}
	// Дельта получилась отрицательной, процент должен быть нулём, а не мусором.
	assertClose(t, "cpu", metrics.CPU, 0)
	assertClose(t, "io wait", metrics.IOWait, 0)
}

func TestLoadAboveCoreCountIsCapped(t *testing.T) {
	first := parseSnapshot(snapshot("cpu  0 0 0 100 0 0 0", "0.00 0.00 0.00 1/1 1"))
	second := parseSnapshot(snapshot("cpu  100 0 0 100 0 0 0", "8.00 8.00 8.00 1/1 1"))

	metrics, _ := second.metrics(first)
	// Девять на одном ядре — это девять, а не сто процентов.
	assertClose(t, "load 1m", metrics.Load1, 8.00)
}

func TestParseSnapshotIgnoresUnknownLines(t *testing.T) {
	sample := parseSnapshot(snapshot(
		"some banner from a login script",
		"cpu  1000 20 300 8000 100 0 50 0 0 0",
		"",
		"1.50 1.20 1.00 2/512 4242",
		"MemTotal:       1000000 kB",
		"MemAvailable:    250000 kB",
		"SwiftShader Driver (expired)",
	))
	if !sample.hasCPU || !sample.hasLoad || !sample.hasMemory {
		t.Fatalf("sample lost data: %+v", sample)
	}
	if sample.total != 9470 {
		t.Errorf("total = %v, want 9470", sample.total)
	}
}

func TestParseSnapshotWithoutMemory(t *testing.T) {
	// В некоторых контейнерах MemAvailable нет, тогда память просто не показывается.
	sample := parseSnapshot(snapshot("cpu  1 1 1 1 1 1 1", "0.10 0.10 0.10 1/1 1", "MemTotal:       1000 kB"))
	if sample.hasMemory {
		t.Error("memory was reported without MemAvailable")
	}
}

func TestMalformedCPULineIsIgnored(t *testing.T) {
	for _, line := range []string{"cpu", "cpu  1 2", "cpu  a b c d"} {
		sample := parseSnapshot(snapshot(line))
		if sample.hasCPU {
			t.Errorf("%q was accepted as a cpu line", line)
		}
	}
}

func TestParseRealContainerOutput(t *testing.T) {
	// Снимок, снятый с alpine в контейнере: формат именно такой и приходит по SSH.
	first := parseSnapshot(snapshot(
		"cpu  116 0 85 12270 81 0 23 0 0 0",
		"0.30 0.07 0.02 1/270 11",
		"MemTotal:        8126672 kB",
		"MemAvailable:    7545188 kB",
	))
	second := parseSnapshot(snapshot(
		"cpu  116 0 86 14286 81 0 23 0 0 0",
		"0.30 0.07 0.02 1/270 23",
		"MemTotal:        8126672 kB",
		"MemAvailable:    7549824 kB",
	))

	metrics, ok := second.metrics(first)
	if !ok {
		t.Fatal("no metrics from real output")
	}
	// За секунду idle вырос на 2016, system на 1 — процессор почти не нагружен.
	assertClose(t, "cpu", metrics.CPU, 1.0/2017.0*100)
	assertClose(t, "io wait", metrics.IOWait, 0)
	assertClose(t, "load 1m", metrics.Load1, 0.30)
	assertClose(t, "load 5m", metrics.Load5, 0.07)
	assertClose(t, "load 15m", metrics.Load15, 0.02)
	// Занято 8126672 - 7549824 из 8126672.
	assertClose(t, "memory", metrics.Memory, (8126672.0-7549824.0)/8126672.0*100)
}

func TestParseFullRealSnapshot(t *testing.T) {
	// Полный снимок в том виде, в каком его отдаёт сервер: load, uptime, память, swap, сеть, df.
	lines := snapshot(
		"cpu  116 0 85 12270 81 0 23 0 0 0",
		"0.30 0.07 0.02 1/270 11",
		"8132.30 5221.44",
		"MemTotal:        8126672 kB",
		"MemAvailable:    7545188 kB",
		"SwapTotal:       2097148 kB",
		"SwapFree:        2097148 kB",
		"net 18364224512 9185210234",
		"/dev/sda1  61255492  12345678  45678901  22% /",
	)
	first := parseSnapshot(lines)

	second := parseSnapshot(snapshot(
		"cpu  116 0 86 14286 81 0 23 0 0 0",
		"3.00 0.07 0.02 4/270 23",
		"8133.30 5260.00",
		"MemTotal:        8126672 kB",
		"MemAvailable:    7549824 kB",
		"SwapTotal:       2097148 kB",
		"SwapFree:        2080000 kB",
		"net 18365224512 9185610234",
		"/dev/sda1  61255492  13345678  45678901  25% /",
	))

	metrics, ok := second.metrics(first)
	if !ok {
		t.Fatal("no metrics from a full snapshot")
	}
	assertClose(t, "load 1m", metrics.Load1, 3.00)
	assertClose(t, "load 5m", metrics.Load5, 0.07)
	assertClose(t, "load 15m", metrics.Load15, 0.02)
	// Uptime вырос на секунду, сеть на 1 МБ — значит 1 МБ/с в каждую сторону.
	assertClose(t, "uptime", metrics.Uptime, 8133.30)
	assertClose(t, "network in", metrics.NetworkIn, 1000000)
	assertClose(t, "network out", metrics.NetworkOut, 400000)
	// Занято 2097148 - 2080000 из 2097148.
	assertClose(t, "swap", metrics.Swap, (2097148.0-2080000.0)/2097148.0*100)
	assertClose(t, "disk", metrics.Disk, 25)
	assertClose(t, "processes running", metrics.ProcessesRunning, 4)
	assertClose(t, "processes total", metrics.ProcessesTotal, 270)
	assertClose(t, "memory", metrics.Memory, (8126672.0-7549824.0)/8126672.0*100)
}

func TestMissingSourcesStayUnavailable(t *testing.T) {
	// Минимальная система без swap, без /proc/net/dev и без df: показатели остаются незаполненными,
	// чтобы панель показала прочерк, а не правдоподобный ноль.
	first := parseSnapshot(snapshot("cpu  1 0 1 100 0 0 0", "0.10 0.10 0.10 1/1 1", "100.00 0.50"))
	second := parseSnapshot(snapshot("cpu  1 0 1 200 0 0 0", "0.10 0.10 0.10 1/1 1", "101.00 0.50"))

	metrics, ok := second.metrics(first)
	if !ok {
		t.Fatal("no metrics")
	}
	// Ни памяти, ни swap, ни df, ни /proc/net/dev сервер не отдал: это «недоступно», а не ноль.
	assertClose(t, "memory", metrics.Memory, -1)
	assertClose(t, "swap", metrics.Swap, -1)
	assertClose(t, "disk", metrics.Disk, -1)
	assertClose(t, "network in", metrics.NetworkIn, -1)
	assertClose(t, "processes total", metrics.ProcessesTotal, 1)
	assertClose(t, "uptime", metrics.Uptime, 101.00)
}

func TestUptimeLineIsNotConfusedWithLoadavg(t *testing.T) {
	// Первое поле loadavg и перв��е uptime оба числа, поэтому порядок проверок важен.
	sample := parseSnapshot(snapshot("0.30 0.07 0.02 1/270 11", "8126672.30 5221.44"))
	if !sample.hasLoad || !sample.hasProcesses {
		t.Error("load average was lost")
	}
	if !sample.hasUptime {
		t.Error("uptime was not read")
	}
	assertClose(t, "uptime", sample.uptime, 8126672.30)
	assertClose(t, "load 1m", sample.load1, 0.30)
	assertClose(t, "load 5m", sample.load5, 0.07)
	assertClose(t, "load 15m", sample.load15, 0.02)
}

func TestCommandShape(t *testing.T) {
	// Сторож обязан быть в конце снимка, иначе циклом нельзя снять счётчики попарно.
	if !strings.Contains(metricsSnapshotCommand, "sleep 1") {
		t.Error("the snapshot command does not pause between samples")
	}
	if strings.Index(metricsSnapshotCommand, metricsSnapshotMarker) < strings.Index(metricsSnapshotCommand, "MemAvailable") {
		t.Error("the snapshot marker must come after the values it closes")
	}
	for _, source := range []string{"/proc/stat", "/proc/loadavg", "/proc/uptime", "/proc/meminfo", "/proc/net/dev", "df -P /"} {
		if !strings.Contains(metricsSnapshotCommand, source) {
			t.Errorf("the snapshot command misses %q", source)
		}
	}
}

func assertClose(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 0.001 {
		t.Errorf("%s = %v, want %v", name, got, want)
	}
}

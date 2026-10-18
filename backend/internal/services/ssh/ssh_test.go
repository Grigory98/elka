package ssh

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"elka-desktop/backend/internal/apperror"

	"github.com/pkg/sftp"
	gossh "golang.org/x/crypto/ssh"
)

func TestParsePrivateKeyWithPassphrase(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	const passphrase = "correct horse battery staple"
	block, err := gossh.MarshalPrivateKeyWithPassphrase(privateKey, "test", []byte(passphrase))
	if err != nil {
		t.Fatal(err)
	}
	encodedKey := string(pem.EncodeToMemory(block))

	if _, err = parsePrivateKey(encodedKey, ""); err == nil {
		t.Fatal("expected encrypted key parsing to require a passphrase")
	}
	if _, err = parsePrivateKey(encodedKey, "wrong passphrase"); err == nil {
		t.Fatal("expected an incorrect passphrase to fail")
	}
	if _, err = parsePrivateKey(encodedKey, passphrase); err != nil {
		t.Fatalf("expected the correct passphrase to parse the key: %v", err)
	}
}

func TestStartPortForwardRejectsInvalidConfiguration(t *testing.T) {
	_, err := startPortForward(nil, SSHPortForward{
		Mode:          "local",
		ListenPort:    0,
		TargetAddress: "127.0.0.1",
		TargetPort:    22,
	})
	if err == nil {
		t.Fatal("expected invalid port to be rejected")
	}

	_, err = startPortForward(nil, SSHPortForward{
		Mode:          "dynamic",
		ListenAddress: "127.0.0.1",
		ListenPort:    8080,
		TargetAddress: "127.0.0.1",
		TargetPort:    22,
	})
	if err == nil {
		t.Fatal("expected unsupported forwarding mode to be rejected")
	}
}

// A server that refuses the login is the one failure the interface can answer with a password of its
// own, so it has to arrive as its own error code instead of being folded into "could not connect".
func TestConnectReportsARejectedLoginSeparately(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	server.config.PasswordCallback = func(gossh.ConnMetadata, []byte) (*gossh.Permissions, error) {
		return nil, errors.New("wrong password")
	}
	config := server.connectionConfig()

	if _, _, err := connectSSH(config); err == nil {
		t.Fatal("expected the refused password to fail the connection")
	} else {
		var authFailure *targetAuthError
		if !errors.As(err, &authFailure) {
			t.Fatalf("a refused login must be marked as one: %v", err)
		}
	}

	service := NewSshService(noopSSHEmitter{}, nil)
	err := service.Connect(config)
	var appError *apperror.AppError
	if !errors.As(err, &appError) {
		t.Fatalf("expected an app error, got %v", err)
	}
	if appError.Code != apperror.CodeSSHAuthenticationFailed {
		t.Fatalf("expected the authentication code, got %s", appError.Code)
	}
	if !strings.Contains(appError.Message, config.Username) {
		t.Fatalf("the login has to be named in the failure: %q", appError.Message)
	}
}

// A reconnect reuses the session ID, and the teardown of the previous dial travels over the same
// bridge as the new dial. When it lands late it must not take the session that is already up with it:
// that is the difference between a tab that reconnects and a tab that goes dark.
func TestLateDisconnectLeavesTheNewDialAlone(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	service := NewSshService(noopSSHEmitter{}, nil)

	first := server.connectionConfig()
	first.ID = "session-1"
	first.Attempt = "attempt-1"
	if err := service.Connect(first); err != nil {
		t.Fatalf("expected the first dial to connect: %v", err)
	}
	firstSession := service.sessions[first.ID]

	second := server.connectionConfig()
	second.ID = first.ID
	second.Attempt = "attempt-2"
	if err := service.Connect(second); err != nil {
		t.Fatalf("expected the second dial to connect: %v", err)
	}

	// The teardown of the dial that has already been replaced, arriving after its successor answered.
	service.Disconnect(second.ID, first.Attempt)

	current, exists := service.sessions[second.ID]
	if !exists {
		t.Fatal("the reconnect was closed by the teardown meant for its predecessor")
	}
	if current.attempt != second.Attempt {
		t.Fatalf("expected the new dial to own the session, got %q", current.attempt)
	}
	if current == firstSession {
		t.Fatal("expected the previous dial to be replaced by the new one")
	}

	// An empty attempt is what a tab close and a vault wipe send, and it has to reach whatever is there.
	service.Disconnect(second.ID, "")
	if _, exists = service.sessions[second.ID]; exists {
		t.Fatal("an unconditional teardown has to close the session")
	}
}

// A dial replaces the previous one under the same ID, so the session it replaced has to be closed:
// left behind, its shell keeps running on the server and its reader keeps the goroutine alive.
func TestReconnectClosesTheDialItReplaces(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	service := NewSshService(noopSSHEmitter{}, nil)

	first := server.connectionConfig()
	first.ID = "session-1"
	first.Attempt = "attempt-1"
	if err := service.Connect(first); err != nil {
		t.Fatalf("expected the first dial to connect: %v", err)
	}
	replaced := service.sessions[first.ID]

	second := server.connectionConfig()
	second.ID = first.ID
	second.Attempt = "attempt-2"
	if err := service.Connect(second); err != nil {
		t.Fatalf("expected the second dial to connect: %v", err)
	}

	// Wait returns the moment the connection is gone, and only then: a dial left open keeps the
	// server waiting, so the timeout is what tells the two apart.
	closed := make(chan error, 1)
	go func() { closed <- replaced.client.Wait() }()
	select {
	case err := <-closed:
		if err == nil {
			t.Fatal("expected the replaced dial to report why it closed")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected the replaced dial to be closed")
	}
}

// Дозвон через туннель обязан укладываться в срок, как и прямой: у ssh.Dial он берётся из ClientConfig,
// а у Dial по туннелю своего нет. Бастион, который до цели не доходит, иначе держал бы вкладку на
// «Подключение…» навсегда.
func TestTunnelDialGivesUpWhenTheHopNeverAnswers(t *testing.T) {
	hop := newFakeSSHServer(t, 1)
	hop.blackholeForwards = true
	client := dialFakeServer(t, hop.connectionConfig())
	t.Cleanup(func() { _ = client.Close() })

	started := time.Now()
	connection, err := dialThroughTunnel(client, "127.0.0.1:22", 250*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		t.Fatal("expected the dial to give up when the hop never answers")
	}
	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Fatalf("expected the dial to give up in time, it took %s", elapsed)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected the deadline to end the dial, got %v", err)
	}
}

// Следующий шаг после пересылки — хендшейк, и он тоже должен быть ограничен: цель, которая поздоровалась
// и замолчала, это тот же самый обрыв на шаг позже.
func TestTunnelHandshakeIsBounded(t *testing.T) {
	hop := newFakeSSHServer(t, 1)
	client := dialFakeServer(t, hop.connectionConfig())
	t.Cleanup(func() { _ = client.Close() })

	stalling := newStallingSSHServer(t)
	connection, err := dialThroughTunnel(client, stalling.address, time.Second)
	if err != nil {
		t.Fatalf("expected the forwarded connection to open: %v", err)
	}

	config, err := newClientConfig("tester", testSFTPPassword, "", "")
	if err != nil {
		t.Fatal(err)
	}

	if _, err = handshakeThroughTunnel(connection, stalling.address, config, 250*time.Millisecond); err == nil {
		t.Fatal("expected the stalling handshake to give up")
	} else if !isTimeout(err) {
		t.Fatalf("expected the handshake to end on the deadline, got %v", err)
	}
}

// Ограничение хендшейка не остаётся на живом соединении: вкладка после него работает, и пауза длиннее
// срока не должна ничего обрывать.
func TestTunnelHandshakeLeavesNoDeadlineBehind(t *testing.T) {
	hop := newFakeSSHServer(t, 1)
	client := dialFakeServer(t, hop.connectionConfig())
	t.Cleanup(func() { _ = client.Close() })

	target := newFakeSSHServer(t, 1).connectionConfig()
	connection, err := dialThroughTunnel(client, net.JoinHostPort(target.Host, strconv.Itoa(target.Port)), time.Second)
	if err != nil {
		t.Fatalf("expected the forwarded connection to open: %v", err)
	}

	config, err := newClientConfig("tester", testSFTPPassword, "", "")
	if err != nil {
		t.Fatal(err)
	}
	forwarded, err := handshakeThroughTunnel(connection, net.JoinHostPort(target.Host, strconv.Itoa(target.Port)), config, 200*time.Millisecond)
	if err != nil {
		t.Fatalf("expected the handshake to finish: %v", err)
	}
	t.Cleanup(func() { _ = forwarded.Close() })

	// Пауза длиннее срока хендшейка: с оставшимся дедлайном соединение оборвалось бы на ней.
	time.Sleep(600 * time.Millisecond)

	session, err := forwarded.NewSession()
	if err != nil {
		t.Fatalf("expected the forwarded session to open after a pause longer than the handshake limit: %v", err)
	}
	_ = session.Close()
}

func isTimeout(err error) bool {
	var netErr net.Error
	if errors.As(err, &netErr) {
		return netErr.Timeout()
	}
	return errors.Is(err, context.DeadlineExceeded)
}

// forwardChannel пересылает канал direct-tcpip в обычный TCP-сокет, как это делает sshd за джамп-хостом.
func forwardChannel(newChannel gossh.NewChannel) {
	var request struct {
		DestinationAddress string
		DestinationPort    uint32
		OriginAddress      string
		OriginPort         uint32
	}
	if err := gossh.Unmarshal(newChannel.ExtraData(), &request); err != nil {
		_ = newChannel.Reject(gossh.ConnectionFailed, "bad forwarding request")
		return
	}
	target := net.JoinHostPort(request.DestinationAddress, strconv.Itoa(int(request.DestinationPort)))
	upstream, err := net.Dial("tcp", target)
	if err != nil {
		_ = newChannel.Reject(gossh.ConnectionFailed, err.Error())
		return
	}
	channel, requests, err := newChannel.Accept()
	if err != nil {
		_ = upstream.Close()
		return
	}
	go gossh.DiscardRequests(requests)
	go func() {
		defer func() {
			_ = channel.Close()
			_ = upstream.Close()
		}()
		go func() { _, _ = io.Copy(upstream, channel) }()
		_, _ = io.Copy(channel, upstream)
	}()
}

// dialFakeServer открывает клиентское соединение с фейковым сервером и проверяет, что оно поднялось.
func dialFakeServer(t *testing.T, config *SSHConnectionConfig) *gossh.Client {
	t.Helper()

	client, jumps, err := connectSSH(config)
	if err != nil {
		t.Fatalf("expected the connection to the fake server to open: %v", err)
	}
	t.Cleanup(func() { closeJumpClients(jumps) })
	return client
}

// stallingSSHServer принимает соединение, читает баннер клиента и замолкает: так ведёт себя цель,
// которая отвечает не полностью.
type stallingSSHServer struct {
	host    string
	port    int
	address string
}

func newStallingSSHServer(t *testing.T) *stallingSSHServer {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	go func() {
		for {
			connection, acceptErr := listener.Accept()
			if acceptErr != nil {
				return
			}
			// Читаем баннер и молчим: клиент ждёт серверный, которого не будет.
			go func() {
				buffer := make([]byte, 512)
				_, _ = connection.Read(buffer)
				select {}
			}()
		}
	}()

	address := listener.Addr().(*net.TCPAddr)
	return &stallingSSHServer{
		host:    address.IP.String(),
		port:    address.Port,
		address: net.JoinHostPort(address.IP.String(), strconv.Itoa(address.Port)),
	}
}

const testSFTPPassword = "hunter2"

// fakeSSHServer держит sessionsPerConnection сессий на соединение, как sshd с MaxSessions. Всё, что
// сверх лимита, отклоняется тем же отказом, что шлёт настоящий OpenSSH, когда session_new() не
// нашёл свободного слота: SSH_OPEN_CONNECT_FAILED с текстом "open failed".
type fakeSSHServer struct {
	listener              net.Listener
	config                *gossh.ServerConfig
	sessionsPerConnection int

	// blackholeForwards — режим, в котором сервер принимает соединение, но на пересылку
	// direct-tcpip не отвечает никогда: так ведёт себя бастион, который до цели не доходит.
	blackholeForwards bool

	mu                      sync.Mutex
	connections             int
	rejectedSessionChannels int
}

func newFakeSSHServer(t *testing.T, sessionsPerConnection int) *fakeSSHServer {
	t.Helper()

	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := gossh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}

	server := &fakeSSHServer{
		sessionsPerConnection: sessionsPerConnection,
		config: &gossh.ServerConfig{
			PasswordCallback: func(gossh.ConnMetadata, []byte) (*gossh.Permissions, error) {
				return nil, nil
			},
		},
	}
	server.config.AddHostKey(signer)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server.listener = listener
	go server.serve()
	t.Cleanup(func() { _ = listener.Close() })
	return server
}

// connectionConfig возвращает настройки подключения к этому серверу.
func (f *fakeSSHServer) connectionConfig() *SSHConnectionConfig {
	address, ok := f.listener.Addr().(*net.TCPAddr)
	if !ok {
		return nil
	}
	return &SSHConnectionConfig{
		Host:     address.IP.String(),
		Port:     address.Port,
		Username: "tester",
		Password: testSFTPPassword,
	}
}

// sinkForwards читает режим чёрной дыры под тем же замком, что и счётчики.
func (f *fakeSSHServer) sinkForwards() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.blackholeForwards
}

// stats возвращает число принятых соединений и число отклонённых каналов сессии.
func (f *fakeSSHServer) stats() (connections, rejected int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.connections, f.rejectedSessionChannels
}

func (f *fakeSSHServer) serve() {
	for {
		connection, err := f.listener.Accept()
		if err != nil {
			return
		}
		go f.handleConnection(connection)
	}
}

func (f *fakeSSHServer) handleConnection(connection net.Conn) {
	serverConn, channels, requests, err := gossh.NewServerConn(connection, f.config)
	if err != nil {
		_ = connection.Close()
		return
	}
	defer serverConn.Close()
	go gossh.DiscardRequests(requests)

	f.mu.Lock()
	f.connections++
	f.mu.Unlock()

	opened := 0
	for newChannel := range channels {
		// Пересылка — то, чем джамп-хост занимается на самом деле: канал direct-tcpip на цель.
		if newChannel.ChannelType() == "direct-tcpip" {
			if f.sinkForwards() {
				continue
			}
			go forwardChannel(newChannel)
			continue
		}
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(gossh.UnknownChannelType, "only session channels are supported")
			continue
		}

		f.mu.Lock()
		allowed := opened < f.sessionsPerConnection
		if allowed {
			opened++
		} else {
			f.rejectedSessionChannels++
		}
		f.mu.Unlock()

		if !allowed {
			_ = newChannel.Reject(gossh.ConnectionFailed, "open failed")
			continue
		}

		channel, channelRequests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		go serveFakeSession(channel, channelRequests)
	}
}

func serveFakeSession(channel gossh.Channel, requests <-chan *gossh.Request) {
	defer channel.Close()
	for request := range requests {
		switch request.Type {
		case "subsystem":
			if !replyWithSFTPVersion(channel, request) {
				return
			}
		case "shell", "exec", "pty-req":
			if request.WantReply {
				_ = request.Reply(true, nil)
			}
		default:
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
		}
	}
}

// replyWithSFTPVersion подтверждает запрос подсистемы и обменивается версией протокола. Дальше
// клиенту достаточно успешного NewClient, поэтому настоящий протокол SFTP тут не нужен.
func replyWithSFTPVersion(channel gossh.Channel, request *gossh.Request) bool {
	var payload struct{ Subsystem string }
	if err := gossh.Unmarshal(request.Payload, &payload); err != nil || payload.Subsystem != "sftp" {
		if request.WantReply {
			_ = request.Reply(false, nil)
		}
		return false
	}
	if request.WantReply {
		if err := request.Reply(true, nil); err != nil {
			return false
		}
	}

	var length [4]byte
	if _, err := io.ReadFull(channel, length[:]); err != nil {
		return false
	}
	initial := make([]byte, binary.BigEndian.Uint32(length[:]))
	if _, err := io.ReadFull(channel, initial); err != nil {
		return false
	}

	// SSH_FXP_VERSION: длина, тип, версия протокола 3. Длина в SFTP не считает саму себя, поэтому
	// в кадре девять байт, а в поле длины — пять.
	version := make([]byte, 9)
	binary.BigEndian.PutUint32(version[0:4], 5)
	version[4] = 2
	binary.BigEndian.PutUint32(version[5:9], 3)
	if _, err := channel.Write(version); err != nil {
		return false
	}

	// Настоящий sftp-server выходит, увидев EOF от клиента, и закрывает канал. Без этого Close()
	// на клиенте ждёт ответа, которого не будет.
	_, _ = io.Copy(io.Discard, channel)
	return false
}

// newTestService поднимает сервис поверх одной готовой сессии, как это делает Connect.
func newTestService(t *testing.T, config *SSHConnectionConfig) *SshService {
	t.Helper()

	service := NewSshService(&noopSSHEmitter{}, nil)
	client, _, err := connectSSH(config)
	if err != nil {
		t.Fatalf("connect to the test server: %v", err)
	}
	session, err := client.NewSession()
	if err != nil {
		_ = client.Close()
		t.Fatalf("open the shell session: %v", err)
	}
	active := &activeSession{client: client, session: session, config: config}
	service.sessions[config.ID] = active
	t.Cleanup(func() {
		// Сессия уже может быть закрыта самим тестом, поэтому берём ту, что поймали, а не ищем снова.
		_ = session.Close()
		closeSFTPConnection(active)
		_ = client.Close()
	})
	return service
}

type noopSSHEmitter struct{}

func (noopSSHEmitter) EmitData(string, []byte)                                       {}
func (noopSSHEmitter) EmitClosed(string)                                             {}
func (noopSSHEmitter) EmitMetrics(string, ServerMetrics)                             {}
func (noopSSHEmitter) EmitSFTPProgress(string, string, string, string, int64, int64) {}

// useSFTP is the smallest thing withSFTP can be asked to do. The callback stands in for a directory
// listing or a transfer: what these tests check is the connection the subsystem ends up on, not the
// SFTP protocol itself, which the handshake above it already covers.
func useSFTP(service *SshService, sessionID string) error {
	return service.withSFTP(sessionID, func(*sftp.Client) error { return nil })
}

// TestSFTPUsesSeparateConnectionWhenSessionsAreExhausted covers the bug this fix exists for. The
// server allows one session per connection and the shell already holds it, which is exactly the
// MaxSessions 2 setup where the metrics channel takes the second slot: opening SFTP on the main
// connection is refused, so it has to get a connection of its own.
func TestSFTPUsesSeparateConnectionWhenSessionsAreExhausted(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	config := server.connectionConfig()
	config.ID = "session-1"
	service := newTestService(t, config)

	if err := useSFTP(service, config.ID); err != nil {
		t.Fatalf("expected SFTP to work on its own connection: %v", err)
	}

	if connections, _ := server.stats(); connections != 2 {
		t.Fatalf("expected a second connection for SFTP, got %d connections", connections)
	}
}

// TestSFTPDoesNotTouchTheMainConnection pins the point of the change: SFTP never opens a channel on
// the connection the terminal runs on, however many sessions that connection still has free.
func TestSFTPDoesNotTouchTheMainConnection(t *testing.T) {
	server := newFakeSSHServer(t, 16)
	config := server.connectionConfig()
	config.ID = "session-1"
	service := newTestService(t, config)

	if err := useSFTP(service, config.ID); err != nil {
		t.Fatalf("expected SFTP to work: %v", err)
	}

	if connections, rejected := server.stats(); connections != 2 || rejected != 0 {
		t.Fatalf("expected a second connection and no refused channels, got %d connections and %d refusals",
			connections, rejected)
	}
}

// TestSFTPKeepsOneClientAcrossOperations guards the channel budget: a fresh channel per directory
// listing would mean a fresh handshake each time and a race for a slot the server frees late. One
// client for the session keeps the second connection opened exactly once.
func TestSFTPKeepsOneClientAcrossOperations(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	config := server.connectionConfig()
	config.ID = "session-1"
	service := newTestService(t, config)

	for range 5 {
		if err := useSFTP(service, config.ID); err != nil {
			t.Fatalf("expected SFTP to keep working: %v", err)
		}
	}

	if connections, _ := server.stats(); connections != 2 {
		t.Fatalf("expected the SFTP connection to be reused, got %d connections", connections)
	}
}

// TestSFTPRebuildsTheClientAfterAFailedOperation checks that a failed operation does not leave a
// half-dead client behind: it is dropped, and the next operation starts from a clean connection.
func TestSFTPRebuildsTheClientAfterAFailedOperation(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	config := server.connectionConfig()
	config.ID = "session-1"
	service := newTestService(t, config)

	if err := useSFTP(service, config.ID); err != nil {
		t.Fatalf("expected SFTP to work: %v", err)
	}

	active := service.sessions[config.ID]
	if active.sftpConn == nil {
		t.Fatal("expected a separate connection to be kept for SFTP")
	}

	operation := errors.New("read remote directory: broken pipe")
	if err := service.withSFTP(config.ID, func(*sftp.Client) error { return operation }); !errors.Is(err, operation) {
		t.Fatalf("expected the operation error to reach the caller, got %v", err)
	}
	if active.sftp != nil {
		t.Fatal("expected the failed operation to drop the SFTP client")
	}
	if active.sftpConn != nil {
		t.Fatal("expected the failed operation to drop its connection")
	}

	if err := useSFTP(service, config.ID); err != nil {
		t.Fatalf("expected SFTP to recover on a new connection: %v", err)
	}
	if active.sftpConn == nil {
		t.Fatal("expected SFTP to be raised again after the failure")
	}
}

// TestDisconnectClosesSFTPConnection checks that the connection SFTP opened does not stay on the
// server after the session is dropped.
func TestDisconnectClosesSFTPConnection(t *testing.T) {
	server := newFakeSSHServer(t, 1)
	config := server.connectionConfig()
	config.ID = "session-1"
	service := newTestService(t, config)

	if err := useSFTP(service, config.ID); err != nil {
		t.Fatalf("expected SFTP to work: %v", err)
	}

	active := service.sessions[config.ID]
	if active.sftpConn == nil {
		t.Fatal("expected a separate connection to be kept for SFTP")
	}

	service.Disconnect(config.ID, config.Attempt)
	if active.sftp != nil || active.sftpConn != nil {
		t.Fatal("expected Disconnect to close the SFTP client and its connection")
	}
}

func TestSFTPReportsMissingSession(t *testing.T) {
	service := NewSshService(&noopSSHEmitter{}, nil)
	if err := useSFTP(service, "missing"); err == nil {
		t.Fatal("expected an error for an unknown session")
	}
}

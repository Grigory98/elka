package ssh

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"net"
	"os"
	"path"
	"path/filepath"
	"sync"
	"testing"

	"github.com/pkg/sftp"
)

type sftpProgressEvent struct {
	direction   string
	name        string
	remotePath  string
	transferred int64
	total       int64
}

type recordingSSHEmitter struct {
	noopSSHEmitter
	mu     sync.Mutex
	events []sftpProgressEvent
}

func (e *recordingSSHEmitter) EmitSFTPProgress(_ string, direction, name, remotePath string, transferred, total int64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.events = append(e.events, sftpProgressEvent{direction, name, remotePath, transferred, total})
}

func (e *recordingSSHEmitter) lastEvent() (sftpProgressEvent, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.events) == 0 {
		return sftpProgressEvent{}, false
	}
	return e.events[len(e.events)-1], true
}

func TestUploadSFTPLocalFilePublishesACompleteFile(t *testing.T) {
	remoteDirectory := t.TempDir()
	localPath := filepath.Join(t.TempDir(), "large.bin")
	data := make([]byte, 2*1024*1024+123)
	if _, err := rand.Read(data); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(localPath, data, 0o600); err != nil {
		t.Fatal(err)
	}

	remotePath := path.Join(remoteDirectory, filepath.Base(localPath))
	if err := os.WriteFile(remotePath, []byte("old contents"), 0o600); err != nil {
		t.Fatal(err)
	}

	client := newTestSFTPClient(t)
	emitter := &recordingSSHEmitter{}
	service := &SshService{emitter: emitter}
	if err := service.uploadSFTPLocalFile(context.Background(), client, "session", remoteDirectory, localPath); err != nil {
		t.Fatalf("upload: %v", err)
	}

	uploaded, err := os.ReadFile(remotePath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(uploaded, data) {
		t.Fatalf("uploaded file differs: got %d bytes, want %d", len(uploaded), len(data))
	}
	if _, err := os.Stat(remotePath + ".temp-upload"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected the temporary file to be gone, stat error: %v", err)
	}

	event, ok := emitter.lastEvent()
	if !ok {
		t.Fatal("expected upload progress events")
	}
	if event.direction != "upload" || event.transferred != int64(len(data)) || event.total != int64(len(data)) {
		t.Fatalf("unexpected final progress: %+v", event)
	}
}

func TestUploadSFTPLocalFileLeavesTheTargetOnCancellation(t *testing.T) {
	remoteDirectory := t.TempDir()
	localPath := filepath.Join(t.TempDir(), "cancelled.bin")
	if err := os.WriteFile(localPath, bytes.Repeat([]byte("new"), 1024), 0o600); err != nil {
		t.Fatal(err)
	}

	remotePath := path.Join(remoteDirectory, filepath.Base(localPath))
	const previous = "previous contents"
	if err := os.WriteFile(remotePath, []byte(previous), 0o600); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	service := &SshService{emitter: &recordingSSHEmitter{}}
	err := service.uploadSFTPLocalFile(ctx, newTestSFTPClient(t), "session", remoteDirectory, localPath)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
	contents, err := os.ReadFile(remotePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != previous {
		t.Fatalf("target changed after cancellation: %q", contents)
	}
	if _, err := os.Stat(remotePath + ".temp-upload"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected the temporary file to be gone, stat error: %v", err)
	}
}

func newTestSFTPClient(t *testing.T) *sftp.Client {
	t.Helper()
	serverConnection, clientConnection := net.Pipe()
	server, err := sftp.NewServer(serverConnection)
	if err != nil {
		t.Fatalf("create SFTP server: %v", err)
	}
	go func() {
		_ = server.Serve()
	}()

	client, err := sftp.NewClientPipe(clientConnection, clientConnection)
	if err != nil {
		_ = server.Close()
		t.Fatalf("create SFTP client: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
		_ = server.Close()
	})
	return client
}

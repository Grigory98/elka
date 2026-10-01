package ssh

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"testing"

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

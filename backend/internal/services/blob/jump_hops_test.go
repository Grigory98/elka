package blob

import (
	"context"
	"database/sql"
	"testing"

	"elka-desktop/backend/internal/dbgen"
	"elka-desktop/backend/internal/migration"
	"elka-desktop/backend/internal/vault"

	_ "github.com/mattn/go-sqlite3"
)

func TestCredentialDeleteUnlinksItFromJumpHops(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = migration.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	queries := dbgen.New(db)
	v := vault.New()
	v.Unlock(make([]byte, 32), make([]byte, 32))
	t.Cleanup(v.Lock)

	ctx := context.Background()
	credentialService := NewCredentialService(queries, v)
	hostService := NewHostService(queries, v)

	credentialID, err := credentialService.Save(ctx, SavedCredential{
		Name:     "Bastion login",
		Username: "jump",
		Password: "jump-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = hostService.Save(ctx, Host{ID: "bastion", Name: "Bastion", Host: "10.0.0.1", Port: 22}); err != nil {
		t.Fatal(err)
	}
	if _, err = hostService.Save(ctx, Host{
		ID:   "target",
		Name: "Target",
		Host: "10.0.0.2",
		Port: 22,
		JumpHops: []JumpHostHop{
			{Mode: JumpHopSavedHost, HostID: "bastion", CredentialID: credentialID},
			{Mode: JumpHopSavedHost, HostID: "bastion"},
		},
	}); err != nil {
		t.Fatal(err)
	}

	if err = credentialService.Delete(ctx, credentialID); err != nil {
		t.Fatal(err)
	}

	hosts, err := hostService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var target Host
	for _, host := range hosts {
		if host.ID == "target" {
			target = host
		}
	}
	if len(target.JumpHops) != 2 {
		t.Fatalf("deleting a credential must not drop jump hops: %#v", target.JumpHops)
	}
	if target.JumpHops[0].CredentialID != "" {
		t.Fatalf("deleted credential is still referenced by a jump hop: %#v", target.JumpHops[0])
	}
	if target.JumpHops[0].HostID != "bastion" {
		t.Fatalf("deleting a credential must not unlink the hop from its saved host: %#v", target.JumpHops[0])
	}
}

func TestHostDeleteUnlinksItFromJumpHops(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = migration.RunMigrations(db); err != nil {
		t.Fatal(err)
	}

	queries := dbgen.New(db)
	v := vault.New()
	v.Unlock(make([]byte, 32), make([]byte, 32))
	t.Cleanup(v.Lock)

	ctx := context.Background()
	hostService := NewHostService(queries, v)

	if _, err = hostService.Save(ctx, Host{ID: "bastion", Name: "Bastion", Host: "10.0.0.1", Port: 22}); err != nil {
		t.Fatal(err)
	}
	if _, err = hostService.Save(ctx, Host{
		ID:       "target",
		Name:     "Target",
		Host:     "10.0.0.2",
		Port:     22,
		JumpHops: []JumpHostHop{{Mode: JumpHopSavedHost, HostID: "bastion"}},
	}); err != nil {
		t.Fatal(err)
	}

	if err = hostService.Delete(ctx, "bastion"); err != nil {
		t.Fatal(err)
	}

	hosts, err := hostService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 {
		t.Fatalf("expected only the target host to survive: %#v", hosts)
	}
	if len(hosts[0].JumpHops) != 0 {
		t.Fatalf("deleted host is still referenced by a jump hop: %#v", hosts[0].JumpHops)
	}
}

package blob

import (
	"context"
	"database/sql"
	"testing"

	"terminator-desktop/backend/internal/dbgen"
	"terminator-desktop/backend/internal/migration"
	"terminator-desktop/backend/internal/vault"

	_ "github.com/mattn/go-sqlite3"
)

func TestGroupRenameAndDeleteUpdateHosts(t *testing.T) {
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
	groupService := NewGroupService(queries, v)

	groupID, err := groupService.Save(ctx, HostGroup{Name: "Production"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = hostService.Save(ctx, Host{ID: "host-1", Name: "API", Host: "api.example.com", Group: "Production"}); err != nil {
		t.Fatal(err)
	}

	if _, err = groupService.Save(ctx, HostGroup{ID: groupID, Name: "Live"}); err != nil {
		t.Fatal(err)
	}
	hosts, err := hostService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 || hosts[0].Group != "Live" {
		t.Fatalf("renamed group was not applied to host: %#v", hosts)
	}

	if err = groupService.Delete(ctx, groupID); err != nil {
		t.Fatal(err)
	}
	hosts, err = hostService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 || hosts[0].Group != "" {
		t.Fatalf("deleted group was not cleared from host: %#v", hosts)
	}
	groups, err := groupService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 0 {
		t.Fatalf("expected no groups after delete, got %#v", groups)
	}
}

func TestGroupServiceIncludesAndDeletesLegacyHostGroups(t *testing.T) {
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
	groupService := NewGroupService(queries, v)
	if _, err = hostService.Save(ctx, Host{ID: "legacy-host", Group: "Legacy"}); err != nil {
		t.Fatal(err)
	}

	groups, err := groupService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].ID != legacyGroupPrefix+"Legacy" {
		t.Fatalf("legacy host group was not exposed: %#v", groups)
	}
	if err = groupService.Delete(ctx, groups[0].ID); err != nil {
		t.Fatal(err)
	}
	hosts, err := hostService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(hosts) != 1 || hosts[0].Group != "" {
		t.Fatalf("legacy group was not cleared from host: %#v", hosts)
	}
}

func TestCredentialServiceStoresCombinedAndMigratesLegacyCredentials(t *testing.T) {
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
	service := NewCredentialService(queries, v)
	groupService := NewGroupService(queries, v)
	ctx := context.Background()

	combinedID, err := service.Save(ctx, SavedCredential{
		Name:       "Complete SSH login",
		Username:   "deploy",
		Password:   "login-secret",
		Passphrase: "key-secret",
		PrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----",
	})
	if err != nil {
		t.Fatal(err)
	}
	groupID, err := groupService.Save(ctx, HostGroup{Name: "Shared", CredentialID: combinedID})
	if err != nil {
		t.Fatal(err)
	}
	legacyID, err := service.Save(ctx, SavedCredential{
		Name:   "Old passphrase",
		Kind:   CredentialKindPassphrase,
		Secret: "legacy-secret",
	})
	if err != nil {
		t.Fatal(err)
	}

	credentials, err := service.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	byID := make(map[string]SavedCredential, len(credentials))
	for _, credential := range credentials {
		byID[credential.ID] = credential
	}
	combined := byID[combinedID]
	if combined.Username != "deploy" || combined.Password != "login-secret" || combined.Passphrase != "key-secret" || combined.PrivateKey == "" {
		t.Fatalf("combined credential fields were not preserved: %#v", combined)
	}
	legacy := byID[legacyID]
	if legacy.Passphrase != "legacy-secret" || legacy.Secret != "" || legacy.Kind != "" {
		t.Fatalf("legacy credential was not migrated to combined format: %#v", legacy)
	}
	if err = service.Delete(ctx, combinedID); err != nil {
		t.Fatal(err)
	}
	groups, err := groupService.GetAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].ID != groupID || groups[0].CredentialID != "" {
		t.Fatalf("deleted credential was not unlinked from its group: %#v", groups)
	}
}

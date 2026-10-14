package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestApplyPendingVaultDirectoryMovesDatabase(t *testing.T) {
	appDir := t.TempDir()
	oldDirectory := filepath.Join(t.TempDir(), "old-vault")
	newDirectory := filepath.Join(t.TempDir(), "new-vault")
	if err := os.MkdirAll(oldDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	const databaseName = "elka.db"
	const databaseContents = "encrypted-vault-test-data"
	oldDatabase := filepath.Join(oldDirectory, databaseName)
	if err := os.WriteFile(oldDatabase, []byte(databaseContents), 0600); err != nil {
		t.Fatal(err)
	}

	service := NewSettingsService(appDir, databaseName, nil, nil)
	current, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	current.VaultDirectory = oldDirectory
	current.PendingVaultDirectory = newDirectory
	current.PendingVaultAction = "move"
	if err = service.SaveSettings(current); err != nil {
		t.Fatal(err)
	}

	if err = ApplyPendingVaultDirectory(appDir, databaseName); err != nil {
		t.Fatal(err)
	}

	newDatabase, err := os.ReadFile(filepath.Join(newDirectory, databaseName))
	if err != nil {
		t.Fatal(err)
	}
	if string(newDatabase) != databaseContents {
		t.Fatalf("moved database contents = %q, want %q", newDatabase, databaseContents)
	}
	if _, err = os.Stat(oldDatabase); !os.IsNotExist(err) {
		t.Fatalf("old database still exists after move: %v", err)
	}

	updated, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if updated.VaultDirectory != newDirectory || updated.PendingVaultDirectory != "" {
		t.Fatalf("settings after move = %#v", updated)
	}
}

func TestGetSettingsMigratesExistingGroupLayoutToTreeOnce(t *testing.T) {
	appDir := t.TempDir()
	configPath := filepath.Join(appDir, "settings.json")
	if err := os.WriteFile(configPath, []byte(`{"language":"en","groupViewMode":"cards"}`), 0600); err != nil {
		t.Fatal(err)
	}

	service := NewSettingsService(appDir, "elka.db", nil, nil)
	settings, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.GroupViewMode != "tree" || settings.GroupViewModeVersion != 1 {
		t.Fatalf("migrated group layout = %#v", settings)
	}

	settings.GroupViewMode = "list"
	if err = service.SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	settings, err = service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.GroupViewMode != "list" {
		t.Fatalf("explicit group layout preference was not preserved: %#v", settings)
	}

	var persisted AppSettings
	contents, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(contents, &persisted); err != nil {
		t.Fatal(err)
	}
	if persisted.GroupViewModeVersion != 1 {
		t.Fatalf("expected group view migration marker, got %d", persisted.GroupViewModeVersion)
	}
}

func TestApplyPendingVaultDirectorySwitchesWithoutMovingData(t *testing.T) {
	appDir := t.TempDir()
	firstDirectory := filepath.Join(t.TempDir(), "first-vault")
	secondDirectory := filepath.Join(t.TempDir(), "second-vault")
	if err := os.MkdirAll(firstDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(secondDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	const databaseName = "elka.db"
	firstDatabase := filepath.Join(firstDirectory, databaseName)
	secondDatabase := filepath.Join(secondDirectory, databaseName)
	if err := os.WriteFile(firstDatabase, []byte("first vault"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secondDatabase, []byte("second vault"), 0600); err != nil {
		t.Fatal(err)
	}

	service := NewSettingsService(appDir, databaseName, nil, nil)
	current, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	current.VaultDirectory = firstDirectory
	current.PendingVaultDirectory = secondDirectory
	current.PendingVaultAction = "switch"
	if err = service.SaveSettings(current); err != nil {
		t.Fatal(err)
	}

	if err = ApplyPendingVaultDirectory(appDir, databaseName); err != nil {
		t.Fatal(err)
	}
	updated, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if updated.VaultDirectory != secondDirectory || updated.PendingVaultDirectory != "" {
		t.Fatalf("settings after switch = %#v", updated)
	}
	firstContents, err := os.ReadFile(firstDatabase)
	if err != nil {
		t.Fatal(err)
	}
	secondContents, err := os.ReadFile(secondDatabase)
	if err != nil {
		t.Fatal(err)
	}
	if string(firstContents) != "first vault" || string(secondContents) != "second vault" {
		t.Fatalf("switch moved or overwrote vault data: first=%q second=%q", firstContents, secondContents)
	}
}

func TestGetSettingsFillsInTerminalScrollbackForOlderFiles(t *testing.T) {
	appDir := t.TempDir()
	configPath := filepath.Join(appDir, "settings.json")
	// A file written before the field existed carries no key at all, which unmarshals to zero. Zero is
	// also what an absent field means here, so it has to come back as the default rather than as "no
	// history at all".
	if err := os.WriteFile(configPath, []byte(`{"language":"en"}`), 0600); err != nil {
		t.Fatal(err)
	}

	service := NewSettingsService(appDir, "elka.db", nil, nil)
	settings, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.TerminalScrollback != DefaultTerminalScrollback {
		t.Fatalf("scrollback from an older settings file = %d, want %d", settings.TerminalScrollback, DefaultTerminalScrollback)
	}
}

func TestTerminalScrollbackIsKeptAndBounded(t *testing.T) {
	appDir := t.TempDir()
	service := NewSettingsService(appDir, "elka.db", nil, nil)

	current, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}

	current.TerminalScrollback = 20000
	if err = service.SaveSettings(current); err != nil {
		t.Fatal(err)
	}
	updated, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if updated.TerminalScrollback != 20000 {
		t.Fatalf("stored scrollback = %d, want 20000", updated.TerminalScrollback)
	}

	updated.TerminalScrollback = MaxTerminalScrollback * 4
	if err = service.SaveSettings(updated); err != nil {
		t.Fatal(err)
	}
	updated, err = service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if updated.TerminalScrollback != MaxTerminalScrollback {
		t.Fatalf("scrollback above the ceiling = %d, want %d", updated.TerminalScrollback, MaxTerminalScrollback)
	}
}

func TestTerminalRendererFallsBackForOlderFiles(t *testing.T) {
	appDir := t.TempDir()
	// A file written before the field existed carries no key, which unmarshals to an empty string.
	// That has to read as the default rather than as an unknown renderer the terminal cannot use.
	if err := os.WriteFile(filepath.Join(appDir, "settings.json"), []byte(`{"language":"en"}`), 0600); err != nil {
		t.Fatal(err)
	}

	service := NewSettingsService(appDir, "elka.db", nil, nil)
	settings, err := service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.TerminalRenderer != DefaultTerminalRenderer {
		t.Fatalf("renderer from an older settings file = %q, want %q", settings.TerminalRenderer, DefaultTerminalRenderer)
	}

	settings.TerminalRenderer = DomTerminalRenderer
	if err = service.SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	settings, err = service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.TerminalRenderer != DomTerminalRenderer {
		t.Fatalf("stored renderer = %q, want %q", settings.TerminalRenderer, DomTerminalRenderer)
	}

	settings.TerminalRenderer = "nonsense"
	if err = service.SaveSettings(settings); err != nil {
		t.Fatal(err)
	}
	settings, err = service.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.TerminalRenderer != DefaultTerminalRenderer {
		t.Fatalf("unknown renderer = %q, want %q", settings.TerminalRenderer, DefaultTerminalRenderer)
	}
}

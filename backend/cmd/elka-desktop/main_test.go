package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func writeFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(contents)
}

func TestMigrateLegacyDataMovesFolderAndFiles(t *testing.T) {
	userDir := t.TempDir()
	appDir := filepath.Join(userDir, appDataDirName)
	legacyDir := filepath.Join(userDir, legacyAppDataDirName)

	if err := os.MkdirAll(legacyDir, 0700); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(legacyDir, legacyDbFile), "encrypted-vault-test-data")
	writeFile(t, filepath.Join(legacyDir, legacyLogFileName), "log-line")

	if err := migrateLegacyData(userDir, appDir); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(legacyDir); !os.IsNotExist(err) {
		t.Fatalf("legacy directory should be gone, got %v", err)
	}
	if contents := readFile(t, filepath.Join(appDir, dbFile)); contents != "encrypted-vault-test-data" {
		t.Fatalf("unexpected vault contents: %q", contents)
	}
	if contents := readFile(t, filepath.Join(appDir, logFileName)); contents != "log-line" {
		t.Fatalf("unexpected log contents: %q", contents)
	}
}

func TestMigrateLegacyDataRenamesFilesInCurrentFolder(t *testing.T) {
	userDir := t.TempDir()
	appDir := filepath.Join(userDir, appDataDirName)

	if err := os.MkdirAll(appDir, 0700); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(appDir, legacyDbFile), "encrypted-vault-test-data")

	if err := migrateLegacyData(userDir, appDir); err != nil {
		t.Fatal(err)
	}

	if contents := readFile(t, filepath.Join(appDir, dbFile)); contents != "encrypted-vault-test-data" {
		t.Fatalf("unexpected vault contents: %q", contents)
	}
}

func TestMigrateLegacyDataKeepsCurrentFiles(t *testing.T) {
	userDir := t.TempDir()
	appDir := filepath.Join(userDir, appDataDirName)
	legacyDir := filepath.Join(userDir, legacyAppDataDirName)

	for _, dir := range []string{appDir, legacyDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	writeFile(t, filepath.Join(appDir, dbFile), "current")
	writeFile(t, filepath.Join(legacyDir, dbFile), "legacy")

	if err := migrateLegacyData(userDir, appDir); err != nil {
		t.Fatal(err)
	}

	if contents := readFile(t, filepath.Join(appDir, dbFile)); contents != "current" {
		t.Fatalf("current vault must not be overwritten, got %q", contents)
	}
	if _, err := os.Stat(legacyDir); err != nil {
		t.Fatalf("legacy folder should stay untouched when both exist: %v", err)
	}
}

func TestMigrateLegacyDataWithoutLegacyData(t *testing.T) {
	userDir := t.TempDir()
	if err := migrateLegacyData(userDir, filepath.Join(userDir, appDataDirName)); err != nil {
		t.Fatal(err)
	}
}

func TestWindowBackgroundColour(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  application.RGBA
	}{
		{"light palette", "#f8fafc", application.NewRGB(248, 250, 252)},
		{"dark palette", "#071a12", application.NewRGB(7, 26, 18)},
		{"without hash", "f8fafc", application.NewRGB(248, 250, 252)},
		{"padded", " #0b1220 ", application.NewRGB(11, 18, 32)},
		{"missing", "", application.NewRGB(9, 9, 11)},
		{"too short", "#fff", application.NewRGB(9, 9, 11)},
		{"not a colour", "rgb(1,2,3)", application.NewRGB(9, 9, 11)},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := windowBackgroundColour(test.value); got != test.want {
				t.Fatalf("windowBackgroundColour(%q) = %+v, want %+v", test.value, got, test.want)
			}
		})
	}
}

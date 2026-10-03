package updater

import (
	"strings"
	"testing"
)

func TestIsNewerVersion(t *testing.T) {
	cases := []struct {
		latest  string
		current string
		want    bool
	}{
		{"1.1.0", "1.0.4", true},
		{"v1.1.0", "1.0.4", true},
		{"1.1.0", "v1.0.4", true},
		{"1.0.5", "1.1.0", false},
		{"1.1.0", "1.1.0", false},
		{"1.1", "1.0.9", true},
		{"1.1.0", "1.1", false},
		{"2.0.0", "1.99.99", true},
		{"1.1.0", "1.1.0-beta.1", true},
		{"1.1.0-beta.2", "1.1.0-beta.1", true},
		{"1.1.0-beta.1", "1.1.0", false},
		// A build without a version accepts any release, an unreadable release tag does not.
		{"1.1.0", "dev", true},
		{"1.1.0", "", true},
		{"dev", "1.0.4", false},
		{"", "1.0.4", false},
	}

	for _, testCase := range cases {
		if got := isNewerVersion(testCase.latest, testCase.current); got != testCase.want {
			t.Errorf("isNewerVersion(%q, %q) = %v, want %v", testCase.latest, testCase.current, got, testCase.want)
		}
	}
}

func TestParseVersionRejectsRubbish(t *testing.T) {
	for _, raw := range []string{"", "v", "latest", "1.2.3.4", "1..2", "1.x", "-1.0.0", "1.0.0-"} {
		if _, ok := parseVersion(raw); ok {
			t.Errorf("parseVersion(%q) accepted an invalid version", raw)
		}
	}
}

func TestPickAsset(t *testing.T) {
	assets := []releaseAsset{
		{Name: "Elka-1.1.0-macos-stable-delta.nupkg"},
		{Name: "Elka-macos-stable-Portable.zip"},
		{Name: "Elka-macos-stable-Setup.pkg"},
		{Name: "Elka-windows-stable-Portable.zip"},
		{Name: "Elka-windows-stable-Setup.exe"},
		{Name: "Elka-linux-stable.AppImage"},
		{Name: "releases.macos-stable.json"},
	}

	cases := map[string]string{
		"windows": "Elka-windows-stable-Setup.exe",
		"darwin":  "Elka-macos-stable-Setup.pkg",
		"linux":   "Elka-linux-stable.AppImage",
	}

	for goos, want := range cases {
		asset, ok := pickAsset(assets, goos)
		if !ok {
			t.Fatalf("pickAsset(%q) found nothing", goos)
		}
		if asset.Name != want {
			t.Errorf("pickAsset(%q) = %q, want %q", goos, asset.Name, want)
		}
	}

	if _, ok := pickAsset(assets, "freebsd"); ok {
		t.Error("pickAsset matched an asset for an unsupported platform")
	}
	if _, ok := pickAsset(nil, "darwin"); ok {
		t.Error("pickAsset matched without assets")
	}
}

func TestPickAssetFallsBackToArchiveOnMacOS(t *testing.T) {
	assets := []releaseAsset{{Name: "Elka-macos-Portable.zip"}}
	asset, ok := pickAsset(assets, "darwin")
	if !ok || asset.Name != "Elka-macos-Portable.zip" {
		t.Errorf("pickAsset(darwin) = %q, %v, want the portable archive", asset.Name, ok)
	}
}

func TestPercent(t *testing.T) {
	cases := []struct {
		downloaded int64
		total      int64
		want       uint
	}{
		{0, 0, 0},
		{0, 100, 0},
		{50, 100, 50},
		{100, 100, 100},
		{150, 100, 100},
	}

	for _, testCase := range cases {
		if got := percent(testCase.downloaded, testCase.total); got != testCase.want {
			t.Errorf("percent(%d, %d) = %d, want %d", testCase.downloaded, testCase.total, got, testCase.want)
		}
	}
}

func TestWaitForExitThen(t *testing.T) {
	command := waitForExitThen(77, "exec '/opt/elka/elka'")
	if !strings.Contains(command, "kill -0 77") {
		t.Errorf("relaunch does not wait for the process: %q", command)
	}
	if !strings.Contains(command, "exec '/opt/elka/elka'") {
		t.Errorf("relaunch lost the command: %q", command)
	}
	if !strings.HasSuffix(command, "; "+command[strings.LastIndex(command, "; ")+2:]) {
		t.Errorf("relaunch is not a single statement: %q", command)
	}
}

func TestQuotes(t *testing.T) {
	if got := shellQuote("/tmp/plain.pkg"); got != "'/tmp/plain.pkg'" {
		t.Errorf("shellQuote = %q", got)
	}
	if got := appleScriptQuote(`/tmp/"quoted"/name`); got != `"/tmp/\"quoted\"/name"` {
		t.Errorf("appleScriptQuote = %q", got)
	}
	if got := powershellQuote(`C:\Program Files\Elka\it's.exe`); got != `'C:\Program Files\Elka\it''s.exe'` {
		t.Errorf("powershellQuote = %q", got)
	}
}

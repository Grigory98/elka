package updater

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
)

// Set at build time with -ldflags "-X elka-desktop/backend/internal/services/updater.appVersion=...".
// Release builds get it from the tag, everything else falls back to the bundle metadata.
var appVersion = "dev"

var bundleVersionPattern = regexp.MustCompile(`<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>`)

// AppVersion reports the running version, or "dev" when it cannot be determined.
func AppVersion() string {
	if appVersion != "dev" {
		return appVersion
	}
	if fromBundle := bundleVersion(); fromBundle != "" {
		return fromBundle
	}
	return appVersion
}

// bundleVersion reads the version from the macOS bundle the executable lives in, so a local build
// reports the same number the installer will show.
func bundleVersion() string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	// The executable sits in Contents/MacOS, the metadata in Contents.
	contents, err := os.ReadFile(filepath.Join(filepath.Dir(executable), "..", "Info.plist"))
	if err != nil {
		return ""
	}
	match := bundleVersionPattern.FindSubmatch(contents)
	if match == nil {
		return ""
	}
	return string(match[1])
}

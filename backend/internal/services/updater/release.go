package updater

import "strings"

// latestReleaseURL answers with the newest published, non draft release of the project.
const latestReleaseURL = "https://api.github.com/repos/" + repoOwner + "/" + repoName + "/releases/latest"

type githubRelease struct {
	TagName     string         `json:"tag_name"`
	Body        string         `json:"body"`
	HTMLURL     string         `json:"html_url"`
	PublishedAt string         `json:"published_at"`
	Assets      []releaseAsset `json:"assets"`
}

type releaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type version struct {
	major int
	minor int
	patch int
	pre   string
}

// parseVersion accepts the shapes a tag can take: "1.1.0", "v1.1.0", "1.1" and a prerelease suffix.
func parseVersion(raw string) (version, bool) {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "v")
	trimmed = strings.TrimPrefix(trimmed, "V")
	if trimmed == "" {
		return version{}, false
	}

	parsed := version{}
	if cut := strings.IndexAny(trimmed, "-+"); cut >= 0 {
		parsed.pre = trimmed[cut+1:]
		trimmed = trimmed[:cut]
		if parsed.pre == "" {
			return version{}, false
		}
	}

	parts := strings.Split(trimmed, ".")
	if len(parts) == 0 || len(parts) > 3 {
		return version{}, false
	}
	numbers := make([]int, 0, len(parts))
	for _, part := range parts {
		number, err := parseNumber(part)
		if err != nil {
			return version{}, false
		}
		numbers = append(numbers, number)
	}
	parsed.major = numbers[0]
	if len(numbers) > 1 {
		parsed.minor = numbers[1]
	}
	if len(numbers) > 2 {
		parsed.patch = numbers[2]
	}
	return parsed, true
}

func parseNumber(part string) (int, error) {
	if part == "" {
		return 0, errNotANumber
	}
	number := 0
	for _, digit := range part {
		if digit < '0' || digit > '9' {
			return 0, errNotANumber
		}
		number = number*10 + int(digit-'0')
	}
	return number, nil
}

type numberError string

func (e numberError) Error() string { return string(e) }

const errNotANumber = numberError("not a number")

func compareVersions(a, b version) int {
	switch {
	case a.major != b.major:
		return compareInts(a.major, b.major)
	case a.minor != b.minor:
		return compareInts(a.minor, b.minor)
	case a.patch != b.patch:
		return compareInts(a.patch, b.patch)
	case a.pre == b.pre:
		return 0
	case a.pre == "":
		return 1
	case b.pre == "":
		return -1
	default:
		return strings.Compare(a.pre, b.pre)
	}
}

func compareInts(a, b int) int {
	if a > b {
		return 1
	}
	if a < b {
		return -1
	}
	return 0
}

// isNewerVersion reports whether the release should be offered over the running build. An unknown
// current version, such as a local build, accepts any release.
func isNewerVersion(latest, current string) bool {
	currentVersion, ok := parseVersion(current)
	if !ok {
		return true
	}
	latestVersion, ok := parseVersion(latest)
	if !ok {
		return false
	}
	return compareVersions(latestVersion, currentVersion) > 0
}

// pickAsset finds the installer for a platform. Release assets are named after the channel and carry
// the architecture, so matching on the extension and a keyword keeps working when either changes.
func pickAsset(assets []releaseAsset, goos string) (releaseAsset, bool) {
	preferences := assetPreferences(goos)
	for _, preference := range preferences {
		for _, asset := range assets {
			if preference(asset.Name) {
				return asset, true
			}
		}
	}
	return releaseAsset{}, false
}

func assetPreferences(goos string) []func(name string) bool {
	hasSuffix := func(suffixes ...string) func(string) bool {
		return func(name string) bool {
			lowered := strings.ToLower(name)
			for _, suffix := range suffixes {
				if strings.HasSuffix(lowered, suffix) {
					return true
				}
			}
			return false
		}
	}
	contains := func(needle string) func(string) bool {
		return func(name string) bool {
			return strings.Contains(strings.ToLower(name), needle)
		}
	}
	both := func(first, second func(string) bool) func(string) bool {
		return func(name string) bool { return first(name) && second(name) }
	}

	switch goos {
	case "windows":
		// The setup executable installs and replaces the application, the portable archive does not.
		return []func(string) bool{both(hasSuffix(".exe"), contains("setup"))}
	case "darwin":
		// Prefer the package installer: it is the only asset that can write into /Applications.
		return []func(string) bool{hasSuffix(".pkg"), both(hasSuffix(".zip"), contains("macos"))}
	case "linux":
		return []func(string) bool{hasSuffix(".appimage")}
	default:
		return nil
	}
}

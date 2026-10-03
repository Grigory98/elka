package updater

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	repoOwner = "NBK1328"
	repoName  = "elka"

	// checkTimeout keeps the settings page responsive when GitHub is slow, and downloadTimeout only
	// has to survive a slow connection, not a hung one.
	checkTimeout    = 15 * time.Second
	downloadTimeout = 30 * time.Minute

	// progressInterval throttles the events: the download runs on its own goroutine and the frontend
	// only repaints on change, so one event per read would be wasted work.
	progressInterval = 150 * time.Millisecond

	downloadDirName = "update"

	// waitStep is how often the relaunch helper checks that the application is gone, and
	// installerWait is the longest a platform installer may take before it is left to finish alone.
	waitStep      = 0.3
	installerWait = 10 * time.Minute
)

type Emitter interface {
	EmitProgress(downloaded int64, total int64, percent uint)
	// Quit closes the window so the installer is free to replace the application files.
	Quit()
}

type UpdateInfo struct {
	IsAvailable    bool   `json:"isAvailable"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	Notes          string `json:"notes"`
	PublishedAt    string `json:"publishedAt"`
	ReleaseURL     string `json:"releaseUrl"`
	AssetName      string `json:"assetName"`
	AssetURL       string `json:"assetUrl"`
	AssetSize      int64  `json:"assetSize"`
}

type pendingUpdate struct {
	url  string
	name string
	path string
}

type UpdaterService struct {
	emitter     Emitter
	downloadDir string
	client      *http.Client
	mu          sync.Mutex
	pending     *pendingUpdate
}

func NewUpdaterService(emitter Emitter, appDir string) *UpdaterService {
	return &UpdaterService{
		emitter:     emitter,
		downloadDir: filepath.Join(appDir, downloadDirName),
		client: &http.Client{
			// The download must not share the check timeout, so the client has no timeout of its own
			// and every request carries its own context instead.
			Transport: http.DefaultTransport,
		},
	}
}

// CheckForUpdates reads the latest published release and compares its tag with the running version.
// A build without a known version always accepts the release, so a locally built binary sees the same
// flow as an installed one.
func (s *UpdaterService) CheckForUpdates() (*UpdateInfo, error) {
	release, err := s.fetchLatestRelease()
	if err != nil {
		return nil, err
	}

	current := AppVersion()
	latest := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	info := &UpdateInfo{
		IsAvailable:    isNewerVersion(latest, current),
		CurrentVersion: current,
		LatestVersion:  latest,
		Notes:          release.Body,
		PublishedAt:    release.PublishedAt,
		ReleaseURL:     release.HTMLURL,
	}

	asset, hasAsset := pickAsset(release.Assets, runtime.GOOS)
	if hasAsset {
		info.AssetName = asset.Name
		info.AssetURL = asset.BrowserDownloadURL
		info.AssetSize = asset.Size
	}

	s.mu.Lock()
	s.pending = nil
	if info.IsAvailable && hasAsset {
		s.pending = &pendingUpdate{url: asset.BrowserDownloadURL, name: asset.Name}
	}
	s.mu.Unlock()

	return info, nil
}

// DownloadUpdate fetches the installer found by the last check into the application directory and
// reports how much of it has arrived. The file is written next to its target and renamed, so an
// interrupted download never leaves a half written installer behind.
func (s *UpdaterService) DownloadUpdate() error {
	s.mu.Lock()
	pending := s.pending
	s.mu.Unlock()
	if pending == nil {
		return fmt.Errorf("no update pending")
	}

	if err := os.MkdirAll(s.downloadDir, 0755); err != nil {
		return fmt.Errorf("failed to create the download directory: %w", err)
	}
	target := filepath.Join(s.downloadDir, pending.name)
	partial := target + ".part"

	ctx, cancel := context.WithTimeout(context.Background(), downloadTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, pending.url, nil)
	if err != nil {
		return fmt.Errorf("failed to build the download request: %w", err)
	}
	setGitHubHeaders(request)
	response, err := s.client.Do(request)
	if err != nil {
		return fmt.Errorf("failed to download the update: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download the update: unexpected status %d", response.StatusCode)
	}

	file, err := os.Create(partial)
	if err != nil {
		return fmt.Errorf("failed to create the download file: %w", err)
	}
	written, err := s.copyWithProgress(response.Body, file, response.ContentLength)
	closeErr := file.Close()
	if err != nil {
		_ = os.Remove(partial)
		return err
	}
	if closeErr != nil {
		_ = os.Remove(partial)
		return fmt.Errorf("failed to finish the download file: %w", closeErr)
	}
	// GitHub answers with a redirect to the asset, so the announced length is not the payload length.
	if response.ContentLength > 0 && written != response.ContentLength {
		_ = os.Remove(partial)
		return fmt.Errorf("failed to download the update: got %d of %d bytes", written, response.ContentLength)
	}

	if err := os.Rename(partial, target); err != nil {
		_ = os.Remove(partial)
		return fmt.Errorf("failed to move the update into place: %w", err)
	}

	s.mu.Lock()
	pending.path = target
	s.mu.Unlock()
	s.emitter.EmitProgress(written, written, 100)
	return nil
}

// ApplyAndRestart installs the downloaded update and restarts the application. The installation runs
// in the foreground on purpose: a detached installer that fails leaves the user with an application
// that simply disappeared, with nothing to show for it.
func (s *UpdaterService) ApplyAndRestart() error {
	s.mu.Lock()
	pending := s.pending
	s.mu.Unlock()
	if pending == nil || pending.path == "" {
		return fmt.Errorf("no update downloaded")
	}

	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to locate the running application: %w", err)
	}

	var relaunch string
	switch runtime.GOOS {
	case "windows":
		if err := s.installWindows(pending); err != nil {
			return err
		}
		relaunch = fmt.Sprintf("Start-Process %s", powershellQuote(executable))
	case "darwin":
		if err := s.installDarwin(pending); err != nil {
			return err
		}
		// A build that is not running from a bundle has nothing to reopen.
		if bundle := applicationBundle(); bundle != "" {
			relaunch = fmt.Sprintf("/usr/bin/open %s", shellQuote(bundle))
		}
	case "linux":
		if err := s.replaceExecutable(pending, executable); err != nil {
			return err
		}
		relaunch = fmt.Sprintf("exec %s", shellQuote(executable))
	default:
		return fmt.Errorf("updates are not supported on %s", runtime.GOOS)
	}

	// Launching right away would only reach the single instance handler of the process that is still
	// running, so the restart waits for this one to exit first.
	if err := s.scheduleRelaunch(relaunch); err != nil {
		return fmt.Errorf("the application was updated but could not be restarted: %w", err)
	}
	s.emitter.Quit()
	return nil
}

// installWindows runs the installer silently. It may hand the work to an elevated child that outlives
// the first process, so the wait has a limit and a fast exit counts as success.
func (s *UpdaterService) installWindows(pending *pendingUpdate) error {
	installer := exec.Command(pending.path, "/S")
	installer.Dir = s.downloadDir
	if err := installer.Start(); err != nil {
		return fmt.Errorf("failed to start the installer: %w", err)
	}

	finished := make(chan error, 1)
	go func() { finished <- installer.Wait() }()
	select {
	case err := <-finished:
		if err != nil {
			var exitError *exec.ExitError
			if errors.As(err, &exitError) {
				return fmt.Errorf("the installer failed with code %d", exitError.ExitCode())
			}
			return fmt.Errorf("the installer failed: %w", err)
		}
	case <-time.After(installerWait):
		// The elevated child took over, it reports through its own window.
	}
	return nil
}

// installDarwin installs the package with administrator rights while the application keeps running:
// replacing a bundle does not disturb a process that is already loaded from it.
func (s *UpdaterService) installDarwin(pending *pendingUpdate) error {
	command := fmt.Sprintf("/usr/sbin/installer -pkg %s -target /", shellQuote(pending.path))
	// AppleScript gives every command two minutes unless it is told otherwise, which is not enough
	// for a package of this size on a slow connection.
	script := fmt.Sprintf("with timeout of %d seconds\ndo shell script %s with administrator privileges\nend timeout",
		int(installerWait.Seconds()), appleScriptQuote(command))

	output, err := exec.Command("/usr/bin/osascript", "-e", script).CombinedOutput()
	if err == nil {
		return nil
	}
	details := strings.TrimSpace(string(output))
	if details == "" {
		details = err.Error()
	}
	return fmt.Errorf("the installer failed: %s", details)
}

// replaceExecutable swaps the running executable for the downloaded AppImage. The replacement goes
// through a rename, which the kernel allows even while the old binary runs.
func (s *UpdaterService) replaceExecutable(pending *pendingUpdate, executable string) error {
	payload, err := os.ReadFile(pending.path)
	if err != nil {
		return fmt.Errorf("failed to read the update: %w", err)
	}

	staged := executable + ".new"
	if err := os.WriteFile(staged, payload, 0755); err != nil {
		return fmt.Errorf("failed to write the update next to the application: %w", err)
	}
	if err := os.Rename(staged, executable); err != nil {
		_ = os.Remove(staged)
		return fmt.Errorf("failed to replace the application: %w", err)
	}
	return nil
}

// scheduleRelaunch starts a detached helper that waits for this process to exit and then runs the
// command it was given.
func (s *UpdaterService) scheduleRelaunch(command string) error {
	if command == "" {
		return nil
	}

	var relaunch *exec.Cmd
	if runtime.GOOS == "windows" {
		// PowerShell is the one shell Windows is guaranteed to have, there is no /bin/sh there.
		relaunch = exec.Command("powershell", "-NoProfile", "-Command", fmt.Sprintf(
			"Wait-Process -Id %d -ErrorAction SilentlyContinue; %s", os.Getpid(), command))
	} else {
		relaunch = exec.Command("/bin/sh", "-c", waitForExitThen(os.Getpid(), command))
	}
	relaunch.Stdout = os.Stdout
	relaunch.Stderr = os.Stderr
	return relaunch.Start()
}

func waitForExitThen(pid int, command string) string {
	return fmt.Sprintf("while kill -0 %d 2>/dev/null; do sleep %s; done; %s",
		pid, strconv.FormatFloat(waitStep, 'f', 1, 64), command)
}

// applicationBundle walks up from the executable to the bundle that contains it, if there is one.
func applicationBundle() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	directory := filepath.Dir(executable)
	for {
		if strings.HasSuffix(directory, ".app") {
			return directory
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return ""
		}
		directory = parent
	}
}

func (s *UpdaterService) copyWithProgress(source io.Reader, target io.Writer, total int64) (int64, error) {
	buffer := make([]byte, 128*1024)
	var written int64
	lastReport := time.Now()
	s.emitter.EmitProgress(0, total, 0)

	for {
		read, readErr := source.Read(buffer)
		if read > 0 {
			if _, err := target.Write(buffer[:read]); err != nil {
				return written, fmt.Errorf("failed to write the update: %w", err)
			}
			written += int64(read)
			if time.Since(lastReport) >= progressInterval {
				lastReport = time.Now()
				s.emitter.EmitProgress(written, total, percent(written, total))
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				return written, nil
			}
			return written, fmt.Errorf("failed to read the update: %w", readErr)
		}
	}
}

func (s *UpdaterService) fetchLatestRelease() (*githubRelease, error) {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, latestReleaseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build the update request: %w", err)
	}
	setGitHubHeaders(request)

	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("failed to reach GitHub: %w", err)
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, fmt.Errorf("the project has no published releases yet")
	case http.StatusForbidden, http.StatusTooManyRequests:
		return nil, fmt.Errorf("GitHub rate limited the update check, try again later")
	default:
		return nil, fmt.Errorf("failed to check for updates: unexpected status %d", response.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to read the release information: %w", err)
	}
	if strings.TrimSpace(release.TagName) == "" {
		return nil, fmt.Errorf("the latest release carries no version tag")
	}
	return &release, nil
}

// GitHub rejects requests without a user agent, and the API version header keeps the response shape
// stable regardless of when the application is updated.
func setGitHubHeaders(request *http.Request) {
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	request.Header.Set("User-Agent", "Elka/"+AppVersion())
}

func percent(downloaded, total int64) uint {
	if total <= 0 {
		return 0
	}
	if downloaded >= total {
		return 100
	}
	return uint(downloaded * 100 / total)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func appleScriptQuote(value string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(value) + `"`
}

// powershellQuote wraps a value in single quotes, doubling the ones inside it.
func powershellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

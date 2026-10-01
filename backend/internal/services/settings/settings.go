package settings

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

type AppSettings struct {
	Language              string `json:"language"`
	ShowHostGroups        bool   `json:"showHostGroups"`
	HostViewMode          string `json:"hostViewMode"`
	GroupViewMode         string `json:"groupViewMode"`
	AppBackgroundColor    string `json:"appBackgroundColor,omitempty"`
	AppForegroundColor    string `json:"appForegroundColor,omitempty"`
	AppAccentColor        string `json:"appAccentColor,omitempty"`
	AppFontFamily         string `json:"appFontFamily,omitempty"`
	TerminalBackground    string `json:"terminalBackground,omitempty"`
	TerminalForeground    string `json:"terminalForeground,omitempty"`
	TerminalCursor        string `json:"terminalCursor,omitempty"`
	TerminalFontFamily    string `json:"terminalFontFamily,omitempty"`
	TerminalFontSize      int    `json:"terminalFontSize,omitempty"`
	GroupViewModeVersion  int    `json:"groupViewModeVersion,omitempty"`
	VaultDirectory        string `json:"vaultDirectory"`
	PendingVaultDirectory string `json:"pendingVaultDirectory,omitempty"`
	PendingVaultAction    string `json:"pendingVaultAction,omitempty"`
}

type SettingsService struct {
	appDir       string
	configPath   string
	databaseName string
	app          *application.App
	restartApp   func()
	mutex        sync.RWMutex
}

func NewSettingsService(appDir, databaseName string, app *application.App, restartApp func()) *SettingsService {
	return &SettingsService{
		appDir:       appDir,
		configPath:   filepath.Join(appDir, "settings.json"),
		databaseName: databaseName,
		app:          app,
		restartApp:   restartApp,
	}
}

func (s *SettingsService) GetSettings() (AppSettings, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	settings := AppSettings{
		Language:             "en",
		ShowHostGroups:       true,
		HostViewMode:         "cards",
		GroupViewMode:        "tree",
		AppBackgroundColor:   "#09090b",
		AppForegroundColor:   "#fafafa",
		AppAccentColor:       "#e4e4e7",
		AppFontFamily:        "Geist Variable",
		TerminalBackground:   "#09090b",
		TerminalForeground:   "#fafafa",
		TerminalCursor:       "#fafafa",
		TerminalFontFamily:   "Cascadia Code",
		TerminalFontSize:     14,
		GroupViewModeVersion: 1,
		VaultDirectory:       s.appDir,
	}

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return settings, nil
		}
		return settings, err
	}

	settings.GroupViewModeVersion = 0
	err = json.Unmarshal(data, &settings)
	if err != nil {
		return settings, err
	}
	if settings.GroupViewModeVersion < 1 {
		settings.GroupViewMode = "tree"
		settings.GroupViewModeVersion = 1
		if err = s.writeSettings(settings); err != nil {
			return settings, err
		}
	}

	return settings, nil
}

func (s *SettingsService) SelectVaultDirectory() (string, error) {
	if s.app == nil {
		return "", fmt.Errorf("directory picker is unavailable")
	}
	return s.app.Dialog.OpenFile().
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(true).
		SetTitle("Choose vault storage folder").
		PromptForSingleSelection()
}

// MoveVaultToDirectory schedules an offline database move and restarts the app.
func (s *SettingsService) MoveVaultToDirectory(directory string) error {
	directory = strings.TrimSpace(directory)
	if directory == "" {
		return fmt.Errorf("vault directory is required")
	}
	absolutePath, err := filepath.Abs(directory)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(absolutePath, 0700); err != nil {
		return err
	}
	settings, err := s.GetSettings()
	if err != nil {
		return err
	}
	currentDirectory := settings.VaultDirectory
	if currentDirectory == "" {
		currentDirectory = s.appDir
	}
	currentAbsolute, err := filepath.Abs(currentDirectory)
	if err != nil {
		return err
	}
	if filepath.Clean(currentAbsolute) == filepath.Clean(absolutePath) {
		return nil
	}
	if s.databaseName == "" {
		return fmt.Errorf("database filename is not configured")
	}
	if err = destinationDatabaseIsEmpty(absolutePath, s.databaseName); err != nil {
		return err
	}
	if s.restartApp == nil {
		return fmt.Errorf("app restart is unavailable")
	}

	settings.PendingVaultDirectory = absolutePath
	settings.PendingVaultAction = "move"
	if err = s.SaveSettings(settings); err != nil {
		return err
	}
	s.restartApp()
	return nil
}

// SwitchVaultDirectory activates another vault directory without moving the current database.
func (s *SettingsService) SwitchVaultDirectory(directory string) error {
	directory = strings.TrimSpace(directory)
	if directory == "" {
		return fmt.Errorf("vault directory is required")
	}
	absolutePath, err := filepath.Abs(directory)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(absolutePath, 0700); err != nil {
		return err
	}
	settings, err := s.GetSettings()
	if err != nil {
		return err
	}
	currentDirectory := settings.VaultDirectory
	if currentDirectory == "" {
		currentDirectory = s.appDir
	}
	currentAbsolute, err := filepath.Abs(currentDirectory)
	if err != nil {
		return err
	}
	if filepath.Clean(currentAbsolute) == filepath.Clean(absolutePath) {
		return nil
	}
	if s.restartApp == nil {
		return fmt.Errorf("app restart is unavailable")
	}

	settings.PendingVaultDirectory = absolutePath
	settings.PendingVaultAction = "switch"
	if err = s.SaveSettings(settings); err != nil {
		return err
	}
	s.restartApp()
	return nil
}

// ApplyPendingVaultDirectory runs before opening SQLite on startup or restart.
func ApplyPendingVaultDirectory(appDir, databaseName string) error {
	service := &SettingsService{
		appDir:       appDir,
		configPath:   filepath.Join(appDir, "settings.json"),
		databaseName: databaseName,
	}
	settings, err := service.GetSettings()
	if err != nil {
		return err
	}
	if settings.PendingVaultDirectory == "" {
		return nil
	}
	if settings.PendingVaultAction == "switch" {
		targetDirectory, err := filepath.Abs(settings.PendingVaultDirectory)
		if err != nil {
			return service.cancelPendingMove(settings, err)
		}
		if err = os.MkdirAll(targetDirectory, 0700); err != nil {
			return service.cancelPendingMove(settings, err)
		}
		settings.VaultDirectory = targetDirectory
		settings.PendingVaultDirectory = ""
		settings.PendingVaultAction = ""
		return service.SaveSettings(settings)
	}

	targetDirectory, err := filepath.Abs(settings.PendingVaultDirectory)
	if err != nil {
		return service.cancelPendingMove(settings, err)
	}
	currentDirectory := settings.VaultDirectory
	if currentDirectory == "" {
		currentDirectory = appDir
	}
	currentDirectory, err = filepath.Abs(currentDirectory)
	if err != nil {
		return service.cancelPendingMove(settings, err)
	}
	if filepath.Clean(currentDirectory) == filepath.Clean(targetDirectory) {
		settings.VaultDirectory = targetDirectory
		settings.PendingVaultDirectory = ""
		settings.PendingVaultAction = ""
		return service.SaveSettings(settings)
	}

	if err = os.MkdirAll(targetDirectory, 0700); err != nil {
		return service.cancelPendingMove(settings, err)
	}
	source := filepath.Join(currentDirectory, databaseName)
	destination := filepath.Join(targetDirectory, databaseName)
	if err = destinationDatabaseIsEmpty(targetDirectory, databaseName); err != nil {
		return service.cancelPendingMove(settings, err)
	}
	if err = copyDatabase(source, destination); err != nil {
		return service.cancelPendingMove(settings, err)
	}

	settings.VaultDirectory = targetDirectory
	settings.PendingVaultDirectory = ""
	settings.PendingVaultAction = ""
	if err = service.SaveSettings(settings); err != nil {
		_ = os.Remove(destination)
		_ = os.Remove(destination + "-wal")
		return err
	}
	_ = os.Remove(filepath.Join(currentDirectory, databaseName))
	_ = os.Remove(filepath.Join(currentDirectory, databaseName+"-wal"))
	_ = os.Remove(filepath.Join(currentDirectory, databaseName+"-shm"))
	return nil
}

func (s *SettingsService) cancelPendingMove(settings AppSettings, cause error) error {
	settings.PendingVaultDirectory = ""
	settings.PendingVaultAction = ""
	if err := s.SaveSettings(settings); err != nil {
		return fmt.Errorf("%v; clearing pending vault move failed: %w", cause, err)
	}
	return cause
}

func destinationDatabaseIsEmpty(directory, databaseName string) error {
	for _, suffix := range []string{"", "-wal", "-shm"} {
		path := filepath.Join(directory, databaseName+suffix)
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("a vault database already exists in the selected folder")
		} else if !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func copyDatabase(source, destination string) error {
	if _, err := os.Stat(source); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := copyFile(source, destination); err != nil {
		return err
	}
	if _, err := os.Stat(source + "-wal"); err == nil {
		if err = copyFile(source+"-wal", destination+"-wal"); err != nil {
			_ = os.Remove(destination)
			_ = os.Remove(destination + "-wal")
			return err
		}
	} else if !os.IsNotExist(err) {
		_ = os.Remove(destination)
		return err
	}
	return nil
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer func() { _ = input.Close() }()

	info, err := input.Stat()
	if err != nil {
		return err
	}
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	syncErr := output.Sync()
	closeErr := output.Close()
	if copyErr != nil {
		_ = os.Remove(destination)
		return copyErr
	}
	if syncErr != nil {
		_ = os.Remove(destination)
		return syncErr
	}
	if closeErr != nil {
		_ = os.Remove(destination)
		return closeErr
	}
	return nil
}

func (s *SettingsService) SaveSettings(settings AppSettings) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.writeSettings(settings)
}

func (s *SettingsService) writeSettings(settings AppSettings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, data, 0644)
}

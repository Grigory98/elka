package blob

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
	"terminator-desktop/backend/internal/dbgen"
	"terminator-desktop/backend/internal/vault"
)

type HostTransferFormat string

const (
	HostTransferTabby     HostTransferFormat = "tabby"
	HostTransferMobaXterm HostTransferFormat = "mobaxterm"
	HostTransferSecureCRT HostTransferFormat = "securecrt"
	maxHostImportSize                        = 20 << 20
)

type HostTransferResult struct {
	Hosts     int  `json:"hosts"`
	Groups    int  `json:"groups"`
	Skipped   int  `json:"skipped"`
	Cancelled bool `json:"cancelled"`
}

type HostTransferService struct {
	q   *dbgen.Queries
	v   *vault.Vault
	app *application.App
	mu  sync.Mutex
}

func NewHostTransferService(q *dbgen.Queries, v *vault.Vault, app *application.App) *HostTransferService {
	return &HostTransferService{q: q, v: v, app: app}
}

func (s *HostTransferService) Import(format string) (HostTransferResult, error) {
	transferFormat := HostTransferFormat(strings.ToLower(strings.TrimSpace(format)))
	if !validHostTransferFormat(transferFormat) {
		return HostTransferResult{}, fmt.Errorf("unsupported import format %q", format)
	}
	if s.app == nil {
		return HostTransferResult{}, fmt.Errorf("file picker is unavailable")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	filename, err := s.app.Dialog.OpenFile().
		CanChooseFiles(true).
		CanChooseDirectories(false).
		SetTitle("Import hosts and groups").
		AddFilter(hostTransferFilterName(transferFormat), hostTransferImportPattern(transferFormat)).
		PromptForSingleSelection()
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("choose an import file: %w", err)
	}
	if filename == "" {
		return HostTransferResult{Cancelled: true}, nil
	}

	file, err := os.Open(filename)
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("open import file: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return HostTransferResult{}, err
	}
	if info.Size() > maxHostImportSize {
		return HostTransferResult{}, fmt.Errorf("import file exceeds the %d MB limit", maxHostImportSize>>20)
	}
	data, err := io.ReadAll(io.LimitReader(file, maxHostImportSize+1))
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("read import file: %w", err)
	}

	parsedHosts, groupNames, skipped, err := parseHostTransfer(transferFormat, filename, data)
	if err != nil {
		return HostTransferResult{}, err
	}
	return s.saveImportedHosts(parsedHosts, groupNames, skipped)
}

func (s *HostTransferService) Export(format string) (HostTransferResult, error) {
	transferFormat := HostTransferFormat(strings.ToLower(strings.TrimSpace(format)))
	if !validHostTransferFormat(transferFormat) {
		return HostTransferResult{}, fmt.Errorf("unsupported export format %q", format)
	}
	if s.app == nil {
		return HostTransferResult{}, fmt.Errorf("file picker is unavailable")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	ctx := context.Background()
	hosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("read hosts: %w", err)
	}
	groups, err := getAllItems[HostGroup](ctx, s.q, s.v, TypeGroup)
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("read host groups: %w", err)
	}
	groupNames := collectGroupNames(groups, hosts)
	data, err := encodeHostTransfer(transferFormat, groups, groupNames, hosts)
	if err != nil {
		return HostTransferResult{}, err
	}

	filename := fmt.Sprintf("terminator-hosts.%s", hostTransferExtension(transferFormat))
	destination, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                "Export hosts and groups",
		Filename:             filename,
		CanCreateDirectories: true,
		Filters: []application.FileFilter{{
			DisplayName: hostTransferFilterName(transferFormat),
			Pattern:     hostTransferExportPattern(transferFormat),
		}},
	}).PromptForSingleSelection()
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("choose an export destination: %w", err)
	}
	if destination == "" {
		return HostTransferResult{Cancelled: true}, nil
	}
	if filepath.Ext(destination) == "" {
		destination += "." + hostTransferExtension(transferFormat)
	}
	if err = os.WriteFile(destination, data, 0600); err != nil {
		return HostTransferResult{}, fmt.Errorf("write export file: %w", err)
	}
	return HostTransferResult{Hosts: len(hosts), Groups: len(groupNames)}, nil
}

func (s *HostTransferService) saveImportedHosts(parsed []parsedHostTransfer, groupNames []string, skipped int) (HostTransferResult, error) {
	if len(parsed) == 0 {
		return HostTransferResult{}, fmt.Errorf("the selected file contains no supported SSH hosts")
	}
	for index := range parsed {
		host := &parsed[index].Host
		host.Host = strings.TrimSpace(host.Host)
		if host.Host == "" {
			return HostTransferResult{}, fmt.Errorf("host at row %d has no hostname", index+1)
		}
		if host.Port == 0 {
			host.Port = 22
		}
		if host.Port < 1 || host.Port > 65535 {
			return HostTransferResult{}, fmt.Errorf("host %q has an invalid port", host.Name)
		}
		host.Name = strings.TrimSpace(host.Name)
		if host.Name == "" {
			host.Name = host.Host
		}
		host.Username = strings.TrimSpace(host.Username)
		host.Group = strings.TrimSpace(host.Group)
	}

	ctx := context.Background()
	currentHosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("read existing hosts: %w", err)
	}
	currentGroups, err := getAllItems[HostGroup](ctx, s.q, s.v, TypeGroup)
	if err != nil {
		return HostTransferResult{}, fmt.Errorf("read existing groups: %w", err)
	}
	canonicalGroups := make(map[string]string)
	for _, group := range currentGroups {
		if name := strings.TrimSpace(group.Name); name != "" {
			canonicalGroups[strings.ToLower(name)] = name
		}
	}
	for _, host := range currentHosts {
		if name := strings.TrimSpace(host.Group); name != "" {
			if _, exists := canonicalGroups[strings.ToLower(name)]; !exists {
				canonicalGroups[strings.ToLower(name)] = name
			}
		}
	}

	for _, name := range groupNames {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, exists := canonicalGroups[key]; exists {
			continue
		}
		group := HostGroup{ID: uuid.NewString(), Type: TypeGroup, Name: name}
		if _, err = saveItem(ctx, s.q, s.v, group.ID, group); err != nil {
			return HostTransferResult{}, fmt.Errorf("save imported group %q: %w", name, err)
		}
		canonicalGroups[key] = name
	}

	for index := range parsed {
		host := &parsed[index].Host
		if host.Group != "" {
			host.Group = canonicalGroups[strings.ToLower(host.Group)]
		}
	}

	newIDs := make(map[string]string, len(parsed))
	for index := range parsed {
		previousID := parsed[index].Host.ID
		parsed[index].Host.ID = uuid.NewString()
		parsed[index].Host.Type = TypeHost
		if previousID != "" {
			newIDs[previousID] = parsed[index].Host.ID
		}
		if parsed[index].SourceID != "" {
			newIDs[parsed[index].SourceID] = parsed[index].Host.ID
		}
	}
	for index := range parsed {
		item := &parsed[index]
		host := &item.Host
		// Export formats do not share Terminator's encrypted credentials or key IDs.
		host.Password = ""
		host.Passphrase = ""
		host.KeyID = ""
		host.PasswordCredentialID = ""
		host.PassphraseCredentialID = ""
		host.PrivateKeyCredentialID = ""
		host.CredentialID = ""
		host.UsePasswordAsPassphrase = false
		if replacement := newIDs[host.JumpHostID]; replacement != "" {
			host.JumpHostID = replacement
		} else {
			host.JumpHostID = ""
		}
		filteredHops := make([]JumpHostHop, 0, len(host.JumpHops))
		for _, hop := range host.JumpHops {
			if hop.Mode == JumpHopSavedHost {
				replacement := newIDs[hop.HostID]
				if replacement == "" {
					continue
				}
				hop.HostID = replacement
			}
			filteredHops = append(filteredHops, hop)
		}
		if item.TabbyJumpHost != "" && len(filteredHops) == 0 {
			targetID := newIDs[item.TabbyJumpHost]
			if targetID == "" {
				targetID = newIDs[item.TabbyJumpHostName]
			}
			if targetID != "" {
				filteredHops = append(filteredHops, JumpHostHop{Mode: JumpHopSavedHost, HostID: targetID})
			}
		}
		host.JumpHops = filteredHops
		if _, err = saveItem(ctx, s.q, s.v, host.ID, *host); err != nil {
			return HostTransferResult{}, fmt.Errorf("save imported host %q: %w", host.Name, err)
		}
	}

	return HostTransferResult{Hosts: len(parsed), Groups: len(groupNames), Skipped: skipped}, nil
}

func validHostTransferFormat(format HostTransferFormat) bool {
	return format == HostTransferTabby || format == HostTransferMobaXterm || format == HostTransferSecureCRT
}

func hostTransferFilterName(format HostTransferFormat) string {
	switch format {
	case HostTransferTabby:
		return "Tabby configuration (*.yaml, *.yml)"
	case HostTransferMobaXterm:
		return "MobaXterm sessions (*.csv, *.mxtsessions)"
	case HostTransferSecureCRT:
		return "SecureCRT exported settings (*.xml)"
	default:
		return "Host transfer file"
	}
}

func hostTransferImportPattern(format HostTransferFormat) string {
	switch format {
	case HostTransferTabby:
		return "*.yaml;*.yml"
	case HostTransferMobaXterm:
		return "*.csv;*.mxtsessions"
	case HostTransferSecureCRT:
		return "*.xml"
	default:
		return "*.*"
	}
}

func hostTransferExportPattern(format HostTransferFormat) string {
	return "*." + hostTransferExtension(format)
}

func hostTransferExtension(format HostTransferFormat) string {
	switch format {
	case HostTransferTabby:
		return "yaml"
	case HostTransferMobaXterm:
		return "csv"
	case HostTransferSecureCRT:
		return "xml"
	default:
		return "dat"
	}
}

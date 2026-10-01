package blob

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"terminator-desktop/backend/internal/dbgen"
	"terminator-desktop/backend/internal/vault"

	"github.com/google/uuid"
)

// wrappers for wails

type HostService struct {
	q *dbgen.Queries
	v *vault.Vault
}

func NewHostService(q *dbgen.Queries, v *vault.Vault) *HostService {
	return &HostService{q: q, v: v}
}

func (s *HostService) Save(ctx context.Context, host Host) (string, error) {
	if host.ID == "" {
		host.ID = uuid.New().String()
	}
	host.Type = TypeHost // just in case
	return saveItem(ctx, s.q, s.v, host.ID, host)
}

func (s *HostService) GetAll(ctx context.Context) ([]Host, error) {
	return getAllItems[Host](ctx, s.q, s.v, TypeHost)
}

func (s *HostService) Delete(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("host ID is required")
	}
	hosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return err
	}
	for _, host := range hosts {
		changed := false
		if host.JumpHostID == id {
			host.JumpHostID = ""
			changed = true
		}
		if len(host.JumpHops) > 0 {
			remaining := make([]JumpHostHop, 0, len(host.JumpHops))
			for _, hop := range host.JumpHops {
				if hop.Mode == JumpHopSavedHost && hop.HostID == id {
					changed = true
					continue
				}
				remaining = append(remaining, hop)
			}
			host.JumpHops = remaining
		}
		if changed {
			if _, err = saveItem(ctx, s.q, s.v, host.ID, host); err != nil {
				return err
			}
		}
	}
	return deleteItem(ctx, s.q, id)
}

type KeyService struct {
	q *dbgen.Queries
	v *vault.Vault
}

func NewKeyService(q *dbgen.Queries, v *vault.Vault) *KeyService {
	return &KeyService{q: q, v: v}
}

func (s *KeyService) Save(ctx context.Context, key SavedKey) (string, error) {
	if key.ID == "" {
		key.ID = uuid.New().String()
	}
	key.Type = TypeKey // just in case
	return saveItem(ctx, s.q, s.v, key.ID, key)
}

func (s *KeyService) GetAll(ctx context.Context) ([]SavedKey, error) {
	return getAllItems[SavedKey](ctx, s.q, s.v, TypeKey)
}

func (s *KeyService) Delete(ctx context.Context, id string) error {
	return deleteItem(ctx, s.q, id)
}

type CredentialService struct {
	q *dbgen.Queries
	v *vault.Vault
}

func NewCredentialService(q *dbgen.Queries, v *vault.Vault) *CredentialService {
	return &CredentialService{q: q, v: v}
}

func (s *CredentialService) Save(ctx context.Context, credential SavedCredential) (string, error) {
	credential.Name = strings.TrimSpace(credential.Name)
	if credential.Name == "" {
		return "", fmt.Errorf("credential name is required")
	}
	if credential.Password == "" && credential.Passphrase == "" && credential.PrivateKey == "" && credential.Secret != "" {
		switch credential.Kind {
		case CredentialKindPassword:
			credential.Password = credential.Secret
		case CredentialKindPassphrase:
			credential.Passphrase = credential.Secret
		case CredentialKindPrivateKey:
			credential.PrivateKey = credential.Secret
		default:
			return "", fmt.Errorf("invalid legacy credential kind")
		}
		credential.Secret = ""
		credential.Kind = ""
	}
	if credential.Password == "" && credential.Passphrase == "" && credential.PrivateKey == "" {
		return "", fmt.Errorf("credential must contain a password, passphrase, or private key")
	}
	credential.Username = strings.TrimSpace(credential.Username)
	if credential.ID == "" {
		credential.ID = uuid.New().String()
	}
	credential.Type = TypeCredential
	return saveItem(ctx, s.q, s.v, credential.ID, credential)
}

func (s *CredentialService) GetAll(ctx context.Context) ([]SavedCredential, error) {
	return getAllItems[SavedCredential](ctx, s.q, s.v, TypeCredential)
}

func (s *CredentialService) Delete(ctx context.Context, id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("credential ID is required")
	}
	hosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return err
	}
	for _, host := range hosts {
		changed := false
		if host.PasswordCredentialID == id {
			host.PasswordCredentialID = ""
			if host.UsePasswordAsPassphrase {
				host.UsePasswordAsPassphrase = false
			}
			changed = true
		}
		if host.PassphraseCredentialID == id {
			host.PassphraseCredentialID = ""
			host.UsePasswordAsPassphrase = false
			changed = true
		}
		if host.PrivateKeyCredentialID == id {
			host.PrivateKeyCredentialID = ""
			changed = true
		}
		if host.CredentialID == id {
			host.CredentialID = ""
			changed = true
		}
		if changed {
			if _, err = saveItem(ctx, s.q, s.v, host.ID, host); err != nil {
				return err
			}
		}
	}
	groups, err := getAllItems[HostGroup](ctx, s.q, s.v, TypeGroup)
	if err != nil {
		return err
	}
	for _, group := range groups {
		if group.CredentialID == id {
			group.CredentialID = ""
			if _, err = saveItem(ctx, s.q, s.v, group.ID, group); err != nil {
				return err
			}
		}
	}
	return deleteItem(ctx, s.q, id)
}

const legacyGroupPrefix = "legacy:"

type GroupService struct {
	q *dbgen.Queries
	v *vault.Vault
}

func NewGroupService(q *dbgen.Queries, v *vault.Vault) *GroupService {
	return &GroupService{q: q, v: v}
}

func (s *GroupService) GetAll(ctx context.Context) ([]HostGroup, error) {
	groups, err := getAllItems[HostGroup](ctx, s.q, s.v, TypeGroup)
	if err != nil {
		return nil, err
	}
	hosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return nil, err
	}

	seenNames := make(map[string]bool, len(groups))
	for _, group := range groups {
		seenNames[strings.ToLower(strings.TrimSpace(group.Name))] = true
	}
	for _, host := range hosts {
		name := strings.TrimSpace(host.Group)
		key := strings.ToLower(name)
		if name == "" || seenNames[key] {
			continue
		}
		groups = append(groups, HostGroup{ID: legacyGroupPrefix + name, Type: TypeGroup, Name: name})
		seenNames[key] = true
	}

	sort.Slice(groups, func(i, j int) bool {
		return strings.ToLower(groups[i].Name) < strings.ToLower(groups[j].Name)
	})
	return groups, nil
}

func (s *GroupService) Save(ctx context.Context, group HostGroup) (string, error) {
	group.Name = strings.TrimSpace(group.Name)
	if group.Name == "" {
		return "", fmt.Errorf("group name is required")
	}

	groups, err := s.GetAll(ctx)
	if err != nil {
		return "", err
	}
	oldName := ""
	if group.ID != "" {
		found := false
		for _, existing := range groups {
			if existing.ID == group.ID {
				oldName = existing.Name
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("group not found")
		}
	}
	for _, existing := range groups {
		if existing.ID != group.ID && strings.EqualFold(existing.Name, group.Name) {
			return "", fmt.Errorf("a group with this name already exists")
		}
	}

	if strings.HasPrefix(group.ID, legacyGroupPrefix) {
		group.ID = uuid.New().String()
	} else if group.ID == "" {
		group.ID = uuid.New().String()
	}
	group.Type = TypeGroup
	if _, err = saveItem(ctx, s.q, s.v, group.ID, group); err != nil {
		return "", err
	}
	if oldName != "" && !strings.EqualFold(oldName, group.Name) {
		if err = s.renameHostGroup(ctx, oldName, group.Name); err != nil {
			return "", err
		}
	}
	return group.ID, nil
}

func (s *GroupService) Delete(ctx context.Context, id string) error {
	groups, err := s.GetAll(ctx)
	if err != nil {
		return err
	}
	var target *HostGroup
	for i := range groups {
		if groups[i].ID == id {
			target = &groups[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("group not found")
	}
	if !strings.HasPrefix(id, legacyGroupPrefix) {
		if err = deleteItem(ctx, s.q, id); err != nil {
			return err
		}
	}

	return s.renameHostGroup(ctx, target.Name, "")
}

func (s *GroupService) renameHostGroup(ctx context.Context, oldName, newName string) error {
	hosts, err := getAllItems[Host](ctx, s.q, s.v, TypeHost)
	if err != nil {
		return err
	}
	for _, host := range hosts {
		if strings.EqualFold(strings.TrimSpace(host.Group), oldName) {
			host.Group = newName
			if _, err = saveItem(ctx, s.q, s.v, host.ID, host); err != nil {
				return err
			}
		}
	}
	return nil
}

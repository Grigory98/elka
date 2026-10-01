package blob

type ItemType string

const (
	TypeHost       ItemType = "host"
	TypeKey        ItemType = "key"
	TypeCredential ItemType = "credential"
	TypeGroup      ItemType = "group"
)

type CredentialKind string

const (
	CredentialKindPassword   CredentialKind = "password"
	CredentialKindPassphrase CredentialKind = "passphrase"
	CredentialKindPrivateKey CredentialKind = "private_key"
)

type PortForwardMode string

const (
	PortForwardLocal  PortForwardMode = "local"
	PortForwardRemote PortForwardMode = "remote"
)

type JumpHopMode string

const (
	JumpHopSavedHost JumpHopMode = "saved_host"
	JumpHopManual    JumpHopMode = "manual"
)

type VaultItemHeader struct {
	Type ItemType `json:"type"`
}

type Host struct {
	ID                      string        `json:"id"`
	Type                    ItemType      `json:"type"`
	Name                    string        `json:"name"`
	Host                    string        `json:"host"`
	Port                    int           `json:"port"`
	Username                string        `json:"username"`
	Password                string        `json:"password,omitempty"`
	Passphrase              string        `json:"passphrase,omitempty"`
	KeyID                   string        `json:"keyId,omitempty"`
	PasswordCredentialID    string        `json:"passwordCredentialId,omitempty"`
	PassphraseCredentialID  string        `json:"passphraseCredentialId,omitempty"`
	PrivateKeyCredentialID  string        `json:"privateKeyCredentialId,omitempty"`
	CredentialID            string        `json:"credentialId,omitempty"`
	JumpHostID              string        `json:"jumpHostId,omitempty"`
	JumpHops                []JumpHostHop `json:"jumpHops,omitempty"`
	PortForwards            []PortForward `json:"portForwards,omitempty"`
	UsePasswordAsPassphrase bool          `json:"usePasswordAsPassphrase,omitempty"`
	Group                   string        `json:"group,omitempty"`
}

type JumpHostHop struct {
	Mode   JumpHopMode `json:"mode"`
	HostID string      `json:"hostId,omitempty"`
	Host   string      `json:"host,omitempty"`
	Port   int         `json:"port,omitempty"`
}

type PortForward struct {
	Mode          PortForwardMode `json:"mode"`
	ListenAddress string          `json:"listenAddress"`
	ListenPort    int             `json:"listenPort"`
	TargetAddress string          `json:"targetAddress"`
	TargetPort    int             `json:"targetPort"`
}

type SavedKey struct {
	ID         string   `json:"id"`
	Type       ItemType `json:"type"`
	Name       string   `json:"name"`
	PrivateKey string   `json:"privateKey"`
}

type SavedCredential struct {
	ID         string         `json:"id"`
	Type       ItemType       `json:"type"`
	Name       string         `json:"name"`
	Username   string         `json:"username,omitempty"`
	Password   string         `json:"password,omitempty"`
	Passphrase string         `json:"passphrase,omitempty"`
	PrivateKey string         `json:"privateKey,omitempty"`
	Kind       CredentialKind `json:"kind,omitempty"`
	Secret     string         `json:"secret,omitempty"`
}

type HostGroup struct {
	ID           string   `json:"id"`
	Type         ItemType `json:"type"`
	Name         string   `json:"name"`
	CredentialID string   `json:"credentialId,omitempty"`
}

package blob

import (
	"bytes"
	"encoding/csv"
	"encoding/xml"
	"fmt"
	"path"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/transform"
	"gopkg.in/yaml.v3"
)

type parsedHostTransfer struct {
	Host              Host
	SourceID          string
	TabbyJumpHost     string
	TabbyJumpHostName string
}

type tabbyTransferConfig struct {
	Version  int                    `yaml:"version"`
	Profiles []tabbyTransferProfile `yaml:"profiles"`
	Groups   []tabbyTransferGroup   `yaml:"groups,omitempty"`
}

type tabbyTransferGroup struct {
	ID            string `yaml:"id"`
	Name          string `yaml:"name"`
	ParentGroupID string `yaml:"parentGroupId,omitempty"`
}

type tabbyTransferProfile struct {
	ID         string                  `yaml:"id"`
	Type       string                  `yaml:"type"`
	Name       string                  `yaml:"name"`
	Group      string                  `yaml:"group,omitempty"`
	Options    tabbyTransferSSHOptions `yaml:"options"`
	Terminator *tabbyTransferMetadata  `yaml:"terminator,omitempty"`
}

type tabbyTransferSSHOptions struct {
	Host           string              `yaml:"host"`
	Port           int                 `yaml:"port,omitempty"`
	User           string              `yaml:"user,omitempty"`
	JumpHost       string              `yaml:"jumpHost,omitempty"`
	ForwardedPorts []tabbyTransferPort `yaml:"forwardedPorts,omitempty"`
}

type tabbyTransferPort struct {
	Type          string `yaml:"type"`
	Host          string `yaml:"host,omitempty"`
	Port          int    `yaml:"port"`
	TargetAddress string `yaml:"targetAddress"`
	TargetPort    int    `yaml:"targetPort"`
	Description   string `yaml:"description,omitempty"`
}

type tabbyTransferMetadata struct {
	HostID                  string        `yaml:"hostId,omitempty"`
	JumpHostID              string        `yaml:"jumpHostId,omitempty"`
	JumpHops                []JumpHostHop `yaml:"jumpHops,omitempty"`
	UsePasswordAsPassphrase bool          `yaml:"usePasswordAsPassphrase,omitempty"`
}

type secureCRTDocument struct {
	XMLName xml.Name        `xml:"VanDyke"`
	Version string          `xml:"version,attr"`
	Keys    []secureCRTNode `xml:"key"`
}

type secureCRTNode struct {
	Name    string           `xml:"name,attr"`
	Keys    []secureCRTNode  `xml:"key,omitempty"`
	Strings []secureCRTValue `xml:"string,omitempty"`
	DWords  []secureCRTValue `xml:"dword,omitempty"`
}

type secureCRTValue struct {
	Name  string `xml:"name,attr"`
	Value string `xml:",chardata"`
}

func parseHostTransfer(format HostTransferFormat, filename string, data []byte) ([]parsedHostTransfer, []string, int, error) {
	switch format {
	case HostTransferTabby:
		return parseTabbyTransfer(data)
	case HostTransferMobaXterm:
		if strings.EqualFold(path.Ext(filename), ".mxtsessions") || bytes.Contains(data, []byte("[Bookmarks")) {
			return parseMobaXtermSessions(data)
		}
		return parseMobaXtermCSV(data)
	case HostTransferSecureCRT:
		return parseSecureCRTXML(data)
	default:
		return nil, nil, 0, fmt.Errorf("unsupported import format %q", format)
	}
}

func encodeHostTransfer(format HostTransferFormat, groups []HostGroup, groupNames []string, hosts []Host) ([]byte, error) {
	switch format {
	case HostTransferTabby:
		return encodeTabbyTransfer(groups, groupNames, hosts)
	case HostTransferMobaXterm:
		return encodeMobaXtermCSV(hosts)
	case HostTransferSecureCRT:
		return encodeSecureCRTXML(groupNames, hosts)
	default:
		return nil, fmt.Errorf("unsupported export format %q", format)
	}
}

func collectGroupNames(groups []HostGroup, hosts []Host) []string {
	seen := make(map[string]bool)
	names := make([]string, 0, len(groups))
	add := func(name string) {
		name = strings.TrimSpace(name)
		key := strings.ToLower(name)
		if name == "" || seen[key] {
			return
		}
		seen[key] = true
		names = append(names, name)
	}
	for _, group := range groups {
		add(group.Name)
	}
	for _, host := range hosts {
		add(host.Group)
	}
	sort.SliceStable(names, func(i, j int) bool { return strings.ToLower(names[i]) < strings.ToLower(names[j]) })
	return names
}

func parseTabbyTransfer(data []byte) ([]parsedHostTransfer, []string, int, error) {
	var config tabbyTransferConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, nil, 0, fmt.Errorf("parse Tabby YAML: %w", err)
	}
	groupsByID := make(map[string]tabbyTransferGroup, len(config.Groups))
	for _, group := range config.Groups {
		groupsByID[group.ID] = group
	}
	groupNamesByID := make(map[string]string, len(config.Groups))
	for _, group := range config.Groups {
		if strings.TrimSpace(group.Name) == "" {
			continue
		}
		groupName := tabbyGroupPath(group, groupsByID)
		groupNamesByID[group.ID] = groupName
	}

	parsed := make([]parsedHostTransfer, 0, len(config.Profiles))
	skipped := 0
	for _, profile := range config.Profiles {
		if !strings.EqualFold(profile.Type, "ssh") {
			skipped++
			continue
		}
		if strings.TrimSpace(profile.Options.Host) == "" {
			skipped++
			continue
		}
		group := groupNamesByID[profile.Group]
		if group == "" {
			group = profile.Group
		}
		port := profile.Options.Port
		if port == 0 {
			port = 22
		}
		host := Host{
			Name:     profile.Name,
			Host:     profile.Options.Host,
			Port:     port,
			Username: profile.Options.User,
			Group:    group,
		}
		if profile.Terminator != nil {
			host.ID = profile.Terminator.HostID
			host.JumpHostID = profile.Terminator.JumpHostID
			host.JumpHops = append([]JumpHostHop(nil), profile.Terminator.JumpHops...)
			host.UsePasswordAsPassphrase = profile.Terminator.UsePasswordAsPassphrase
		}
		for _, forwarded := range profile.Options.ForwardedPorts {
			mode := PortForwardMode(strings.ToLower(forwarded.Type))
			if mode != PortForwardLocal && mode != PortForwardRemote {
				continue
			}
			host.PortForwards = append(host.PortForwards, PortForward{
				Mode: mode, ListenAddress: forwarded.Host, ListenPort: forwarded.Port,
				TargetAddress: forwarded.TargetAddress, TargetPort: forwarded.TargetPort,
			})
		}
		parsed = append(parsed, parsedHostTransfer{
			Host:              host,
			SourceID:          profile.ID,
			TabbyJumpHost:     profile.Options.JumpHost,
			TabbyJumpHostName: profile.Options.JumpHost,
		})
	}
	if len(parsed) == 0 {
		return nil, nil, skipped, fmt.Errorf("Tabby file contains no SSH profiles")
	}
	return parsed, collectGroupNames(nil, parsedHosts(parsed)), skipped, nil
}

func tabbyGroupPath(group tabbyTransferGroup, groupsByID map[string]tabbyTransferGroup) string {
	segments := []string{strings.TrimSpace(group.Name)}
	parentID := group.ParentGroupID
	visited := map[string]bool{group.ID: true}
	for depth := 0; parentID != "" && depth < 32; depth++ {
		parent, exists := groupsByID[parentID]
		if !exists || visited[parentID] {
			break
		}
		visited[parentID] = true
		segments = append(segments, strings.TrimSpace(parent.Name))
		parentID = parent.ParentGroupID
	}
	for left, right := 0, len(segments)-1; left < right; left, right = left+1, right-1 {
		segments[left], segments[right] = segments[right], segments[left]
	}
	filtered := segments[:0]
	for _, segment := range segments {
		if segment = strings.TrimSpace(segment); segment != "" {
			filtered = append(filtered, segment)
		}
	}
	return strings.Join(filtered, "/")
}

func encodeTabbyTransfer(groups []HostGroup, groupNames []string, hosts []Host) ([]byte, error) {
	groupsByName := make(map[string]HostGroup, len(groups))
	for _, group := range groups {
		groupsByName[strings.ToLower(strings.TrimSpace(group.Name))] = group
	}
	groupIDs := make(map[string]string, len(groupNames))
	tabbyGroups := make([]tabbyTransferGroup, 0, len(groupNames))
	for _, name := range groupNames {
		key := strings.ToLower(strings.TrimSpace(name))
		id := groupsByName[key].ID
		if id == "" || strings.HasPrefix(id, legacyGroupPrefix) {
			id = uuid.NewString()
		}
		groupIDs[key] = id
		tabbyGroups = append(tabbyGroups, tabbyTransferGroup{ID: id, Name: name})
	}

	profileIDs := make(map[string]string, len(hosts))
	for _, host := range hosts {
		if host.ID != "" {
			profileIDs[host.ID] = "ssh:custom:" + uuid.NewString()
		}
	}
	profiles := make([]tabbyTransferProfile, 0, len(hosts))
	for _, host := range hosts {
		name := strings.TrimSpace(host.Name)
		if name == "" {
			name = host.Host
		}
		options := tabbyTransferSSHOptions{
			Host: host.Host,
			Port: host.Port,
			User: host.Username,
		}
		if options.Port == 0 {
			options.Port = 22
		}
		for _, forward := range host.PortForwards {
			mode := strings.Title(string(forward.Mode))
			if forward.Mode != PortForwardLocal && forward.Mode != PortForwardRemote {
				continue
			}
			options.ForwardedPorts = append(options.ForwardedPorts, tabbyTransferPort{
				Type: mode, Host: forward.ListenAddress, Port: forward.ListenPort,
				TargetAddress: forward.TargetAddress, TargetPort: forward.TargetPort,
			})
		}
		jumpHostID := host.JumpHostID
		if jumpHostID == "" && len(host.JumpHops) > 0 && host.JumpHops[0].Mode == JumpHopSavedHost {
			jumpHostID = host.JumpHops[0].HostID
		}
		options.JumpHost = profileIDs[jumpHostID]
		profile := tabbyTransferProfile{
			ID:      profileIDs[host.ID],
			Type:    "ssh",
			Name:    name,
			Options: options,
			Terminator: &tabbyTransferMetadata{
				HostID: host.ID, JumpHostID: host.JumpHostID,
				JumpHops: append([]JumpHostHop(nil), host.JumpHops...),
			},
		}
		if strings.TrimSpace(host.Group) != "" {
			profile.Group = groupIDs[strings.ToLower(strings.TrimSpace(host.Group))]
		}
		profiles = append(profiles, profile)
	}
	return yaml.Marshal(tabbyTransferConfig{Version: 7, Profiles: profiles, Groups: tabbyGroups})
}

func parsedHosts(parsed []parsedHostTransfer) []Host {
	hosts := make([]Host, 0, len(parsed))
	for _, item := range parsed {
		hosts = append(hosts, item.Host)
	}
	return hosts
}

func parseMobaXtermCSV(data []byte) ([]parsedHostTransfer, []string, int, error) {
	text, err := decodeMobaText(data)
	if err != nil {
		return nil, nil, 0, err
	}
	reader := csv.NewReader(strings.NewReader(text))
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, nil, 0, fmt.Errorf("parse MobaXterm CSV: %w", err)
	}
	if len(records) < 2 {
		return nil, nil, 0, fmt.Errorf("MobaXterm CSV has no sessions")
	}
	columns := make(map[string]int, len(records[0]))
	for index, header := range records[0] {
		columns[normalizeTransferHeader(header)] = index
	}
	column := func(row []string, names ...string) string {
		for _, name := range names {
			if index, exists := columns[normalizeTransferHeader(name)]; exists && index < len(row) {
				return strings.TrimSpace(row[index])
			}
		}
		return ""
	}
	if _, hostColumn := columns["hostname"]; !hostColumn {
		if _, remoteColumn := columns["remotehost"]; !remoteColumn {
			return nil, nil, 0, fmt.Errorf("MobaXterm CSV is missing the Hostname column")
		}
	}

	parsed := make([]parsedHostTransfer, 0, len(records)-1)
	skipped := 0
	for rowNumber, row := range records[1:] {
		if len(row) == 0 || strings.TrimSpace(strings.Join(row, "")) == "" {
			continue
		}
		sessionType := column(row, "Session type", "Type")
		if sessionType != "" && !strings.EqualFold(sessionType, "ssh") {
			skipped++
			continue
		}
		remoteHost := column(row, "Hostname", "Remote Host", "Host")
		if remoteHost == "" {
			return nil, nil, skipped, fmt.Errorf("MobaXterm CSV row %d has no hostname", rowNumber+2)
		}
		port := 22
		if portValue := column(row, "Port number", "Port", "Port SSH"); portValue != "" {
			parsedPort, parseErr := strconv.Atoi(portValue)
			if parseErr != nil || parsedPort < 1 || parsedPort > 65535 {
				return nil, nil, skipped, fmt.Errorf("MobaXterm CSV row %d has an invalid port", rowNumber+2)
			}
			port = parsedPort
		}
		name := column(row, "Session name", "SessionName", "Name")
		if name == "" {
			name = remoteHost
		}
		host := Host{
			Name: name, Host: remoteHost, Port: port, Username: column(row, "Username", "User"),
			Group: normalizeGroupPath(column(row, "Folder name", "Folder", "FolderPath")),
		}
		gatewayHost := column(row, "Gateway host")
		if gatewayHost != "" {
			gatewayPort := 22
			if value := column(row, "Gateway port"); value != "" {
				if parsedPort, parseErr := strconv.Atoi(value); parseErr == nil && parsedPort > 0 && parsedPort <= 65535 {
					gatewayPort = parsedPort
				}
			}
			host.JumpHops = []JumpHostHop{{Mode: JumpHopManual, Host: gatewayHost, Port: gatewayPort}}
		}
		parsed = append(parsed, parsedHostTransfer{Host: host})
	}
	if len(parsed) == 0 {
		return nil, nil, skipped, fmt.Errorf("MobaXterm CSV contains no SSH sessions")
	}
	return parsed, collectGroupNames(nil, parsedHosts(parsed)), skipped, nil
}

func parseMobaXtermSessions(data []byte) ([]parsedHostTransfer, []string, int, error) {
	text, err := decodeMobaText(data)
	if err != nil {
		return nil, nil, 0, err
	}
	var currentFolder string
	bookmarkHeader := false
	seenSubRep := false
	parsed := make([]parsedHostTransfer, 0)
	skipped := 0
	for lineNumber, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if line == "" || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[Bookmarks") && strings.HasSuffix(line, "]") {
			bookmarkHeader = true
			seenSubRep = false
			continue
		}
		if bookmarkHeader {
			if strings.HasPrefix(line, "SubRep=") {
				currentFolder = normalizeGroupPath(strings.TrimPrefix(line, "SubRep="))
				seenSubRep = true
				continue
			}
			if strings.HasPrefix(line, "ImgNum=") && seenSubRep {
				bookmarkHeader = false
				continue
			}
			continue
		}
		equals := strings.IndexByte(line, '=')
		if equals <= 0 {
			continue
		}
		name := strings.TrimSpace(line[:equals])
		parts := strings.Split(line[equals+1:], "#")
		if len(parts) < 3 {
			skipped++
			continue
		}
		var primary []string
		for _, segment := range parts[2:] {
			fields := strings.Split(segment, "%")
			if len(fields) >= 4 && fields[0] == "0" {
				primary = fields
				break
			}
		}
		if len(primary) < 4 {
			skipped++
			continue
		}
		if primary[0] != "0" {
			skipped++
			continue
		}
		port := 22
		if value, parseErr := strconv.Atoi(primary[2]); parseErr == nil && value > 0 && value <= 65535 {
			port = value
		} else if primary[2] != "" {
			return nil, nil, skipped, fmt.Errorf("MobaXterm session on line %d has an invalid port", lineNumber+1)
		}
		parsed = append(parsed, parsedHostTransfer{Host: Host{
			Name: name, Host: primary[1], Port: port, Username: primary[3], Group: currentFolder,
		}})
	}
	if len(parsed) == 0 {
		return nil, nil, skipped, fmt.Errorf("MobaXterm file contains no SSH sessions")
	}
	return parsed, collectGroupNames(nil, parsedHosts(parsed)), skipped, nil
}

func encodeMobaXtermCSV(hosts []Host) ([]byte, error) {
	var output bytes.Buffer
	writer := csv.NewWriter(&output)
	writer.UseCRLF = true
	if err := writer.Write([]string{"Folder name", "Session name", "Session type", "Hostname", "Username", "Port number"}); err != nil {
		return nil, err
	}
	sorted := append([]Host(nil), hosts...)
	sort.SliceStable(sorted, func(i, j int) bool {
		left := strings.ToLower(sorted[i].Group + "/" + sorted[i].Name)
		right := strings.ToLower(sorted[j].Group + "/" + sorted[j].Name)
		return left < right
	})
	for _, host := range sorted {
		name := strings.TrimSpace(host.Name)
		if name == "" {
			name = host.Host
		}
		port := host.Port
		if port == 0 {
			port = 22
		}
		if err := writer.Write([]string{normalizeGroupPath(host.Group), name, "SSH", host.Host, host.Username, strconv.Itoa(port)}); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func decodeMobaText(data []byte) (string, error) {
	if utf8.Valid(data) {
		return strings.TrimPrefix(string(data), "\ufeff"), nil
	}
	decoded, _, err := transform.Bytes(charmap.Windows1252.NewDecoder(), data)
	if err != nil {
		return "", fmt.Errorf("decode MobaXterm text: %w", err)
	}
	return string(decoded), nil
}

func normalizeTransferHeader(value string) string {
	return strings.Map(func(char rune) rune {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			return unicode.ToLower(char)
		}
		return -1
	}, strings.TrimPrefix(value, "\ufeff"))
}

func normalizeGroupPath(value string) string {
	value = strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	value = strings.Trim(value, "/")
	return strings.Join(strings.FieldsFunc(value, func(r rune) bool { return r == '/' }), "/")
}

func parseSecureCRTXML(data []byte) ([]parsedHostTransfer, []string, int, error) {
	var document secureCRTDocument
	if err := xml.Unmarshal(data, &document); err != nil {
		return nil, nil, 0, fmt.Errorf("parse SecureCRT XML: %w", err)
	}
	sessions := secureCRTChild(document.Keys, "Sessions")
	if sessions == nil {
		return nil, nil, 0, fmt.Errorf("SecureCRT XML has no Sessions section")
	}
	parsed := make([]parsedHostTransfer, 0)
	walkSecureCRTSessions(*sessions, nil, &parsed)
	if len(parsed) == 0 {
		return nil, nil, 0, fmt.Errorf("SecureCRT XML contains no SSH sessions")
	}
	return parsed, collectGroupNames(nil, parsedHosts(parsed)), 0, nil
}

func walkSecureCRTSessions(node secureCRTNode, parents []string, result *[]parsedHostTransfer) {
	hostAddress := strings.TrimSpace(node.value("Hostname"))
	if hostAddress != "" {
		port := 22
		if value := node.value("[SSH2] Port"); value != "" {
			if parsedPort, err := strconv.Atoi(value); err == nil && parsedPort > 0 && parsedPort <= 65535 {
				port = parsedPort
			}
		}
		folders := make([]string, 0, len(parents))
		for _, parent := range parents {
			if parent == "" || strings.EqualFold(parent, "sessions") || strings.EqualFold(parent, "ssh") {
				continue
			}
			folders = append(folders, parent)
		}
		group := strings.Join(folders, "/")
		name := strings.TrimSpace(node.Name)
		if name == "" {
			name = hostAddress
		}
		*result = append(*result, parsedHostTransfer{Host: Host{
			Name: name, Host: hostAddress, Port: port, Username: node.value("Username"), Group: group,
		}})
		return
	}
	childParents := append(append([]string(nil), parents...), node.Name)
	for _, child := range node.Keys {
		walkSecureCRTSessions(child, childParents, result)
	}
}

func (node secureCRTNode) value(name string) string {
	for _, value := range node.Strings {
		if value.Name == name {
			return strings.TrimSpace(value.Value)
		}
	}
	for _, value := range node.DWords {
		if value.Name == name {
			return strings.TrimSpace(value.Value)
		}
	}
	return ""
}

func secureCRTChild(nodes []secureCRTNode, name string) *secureCRTNode {
	for index := range nodes {
		if nodes[index].Name == name {
			return &nodes[index]
		}
	}
	return nil
}

func encodeSecureCRTXML(groupNames []string, hosts []Host) ([]byte, error) {
	sessions := secureCRTNode{Name: "Sessions"}
	for _, groupName := range groupNames {
		parent := &sessions
		for _, segment := range strings.FieldsFunc(strings.ReplaceAll(groupName, "\\", "/"), func(r rune) bool { return r == '/' }) {
			parent = secureCRTGetOrAddChild(parent, segment)
		}
	}
	usedNames := make(map[string]map[string]bool)
	sorted := append([]Host(nil), hosts...)
	sort.SliceStable(sorted, func(i, j int) bool {
		left := strings.ToLower(sorted[i].Group + "/" + sorted[i].Name)
		right := strings.ToLower(sorted[j].Group + "/" + sorted[j].Name)
		return left < right
	})
	for _, host := range sorted {
		folderPath := strings.ReplaceAll(strings.TrimSpace(host.Group), "\\", "/")
		parent := &sessions
		for _, segment := range strings.FieldsFunc(folderPath, func(r rune) bool { return r == '/' }) {
			parent = secureCRTGetOrAddChild(parent, segment)
		}
		name := strings.TrimSpace(host.Name)
		if name == "" {
			name = host.Host
		}
		if usedNames[folderPath] == nil {
			usedNames[folderPath] = make(map[string]bool)
		}
		baseName := name
		for suffix := 2; usedNames[folderPath][name]; suffix++ {
			name = fmt.Sprintf("%s (%d)", baseName, suffix)
		}
		usedNames[folderPath][name] = true
		port := host.Port
		if port == 0 {
			port = 22
		}
		parent.Keys = append(parent.Keys, secureCRTNode{
			Name: name,
			Strings: []secureCRTValue{
				{Name: "Hostname", Value: host.Host},
				{Name: "Username", Value: host.Username},
				{Name: "Credential Title"},
				{Name: "Keyword Set"},
				{Name: "Color Scheme", Value: "Chalkboard"},
				{Name: "Firewall Name", Value: "None"},
				{Name: "SSH2 Authentications V2", Value: "keyboard-interactive,password"},
				{Name: "Cipher List", Value: "aes256-ctr,aes256-cbc"},
			},
			DWords: []secureCRTValue{
				{Name: "[SSH2] Port", Value: strconv.Itoa(port)},
				{Name: "Highlight Bold", Value: "0"},
				{Name: "Highlight Color", Value: "1"},
				{Name: "Highlight Reverse Video", Value: "0"},
			},
		})
	}
	document := secureCRTDocument{
		Version: "3.0",
		Keys: []secureCRTNode{
			sessions,
			{Name: "Credentials"},
			{Name: "Firewalls"},
		},
	}
	encoded, err := xml.MarshalIndent(document, "", "\t")
	if err != nil {
		return nil, fmt.Errorf("encode SecureCRT XML: %w", err)
	}
	return append([]byte(xml.Header), encoded...), nil
}

func secureCRTGetOrAddChild(parent *secureCRTNode, name string) *secureCRTNode {
	for index := range parent.Keys {
		if parent.Keys[index].Name == name {
			return &parent.Keys[index]
		}
	}
	parent.Keys = append(parent.Keys, secureCRTNode{Name: name})
	return &parent.Keys[len(parent.Keys)-1]
}

package blob

import (
	"strings"
	"testing"
)

func TestTabbyTransferPreservesHostsAndGroups(t *testing.T) {
	hosts := []Host{
		{
			ID: "host-1", Name: "API", Host: "api.example.test", Port: 2222, Username: "deploy", Group: "Production",
			JumpHops:     []JumpHostHop{{Mode: JumpHopSavedHost, HostID: "host-2"}},
			PortForwards: []PortForward{{Mode: PortForwardLocal, ListenAddress: "127.0.0.1", ListenPort: 8080, TargetAddress: "localhost", TargetPort: 80}},
		},
		{ID: "host-2", Name: "Bastion", Host: "bastion.example.test", Port: 22, Username: "jump", Group: "Production"},
	}
	groups := []HostGroup{{ID: "group-1", Name: "Production"}}
	encoded, err := encodeTabbyTransfer(groups, []string{"Production"}, hosts)
	if err != nil {
		t.Fatal(err)
	}
	parsed, importedGroups, skipped, err := parseTabbyTransfer(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if skipped != 0 || len(parsed) != 2 || len(importedGroups) != 1 || importedGroups[0] != "Production" {
		t.Fatalf("unexpected Tabby import counts: hosts=%d groups=%v skipped=%d", len(parsed), importedGroups, skipped)
	}
	if parsed[0].Host.Name != "API" || parsed[0].Host.Host != "api.example.test" || parsed[0].Host.Group != "Production" {
		t.Fatalf("host fields did not round-trip: %+v", parsed[0].Host)
	}
	if len(parsed[0].Host.PortForwards) != 1 || len(parsed[0].Host.JumpHops) != 1 || parsed[0].Host.JumpHops[0].HostID != "host-2" {
		t.Fatalf("Tabby metadata block did not round-trip: %+v", parsed[0].Host)
	}
}

func TestMobaXtermCSVPreservesGroupAndConnectionFields(t *testing.T) {
	host := Host{Name: "edge, west", Host: "edge.example.test", Port: 2200, Username: "ops", Group: "West / Edge"}
	encoded, err := encodeMobaXtermCSV([]Host{host})
	if err != nil {
		t.Fatal(err)
	}
	parsed, groups, skipped, err := parseMobaXtermCSV(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if skipped != 0 || len(parsed) != 1 || len(groups) != 1 || groups[0] != host.Group {
		t.Fatalf("unexpected MobaXterm import counts: hosts=%d groups=%v skipped=%d", len(parsed), groups, skipped)
	}
	got := parsed[0].Host
	if got.Name != host.Name || got.Host != host.Host || got.Port != host.Port || got.Username != host.Username || got.Group != host.Group {
		t.Fatalf("MobaXterm host fields did not round-trip: %+v", got)
	}
}

func TestMobaXtermSessionsImportReadsFoldersAndSSHFields(t *testing.T) {
	data := strings.Join([]string{
		"[Bookmarks]",
		"SubRep=",
		"ImgNum=42",
		"[Bookmarks_1]",
		"SubRep=Operations\\Production",
		"ImgNum=41",
		"api=#109#0%api.example.test%2222%deploy%%-1%-1%%%%%0%0%0%%%-1%0%0%0%%1080%%0%0%1%#MobaFont%10%0%0%0%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%0%_Std_Colors_0_%80%24%0%0%-1%<none>%%0%0%-1%-1#0# #-1",
	}, "\n")
	parsed, groups, skipped, err := parseMobaXtermSessions([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	if skipped != 0 || len(parsed) != 1 || len(groups) != 1 || groups[0] != "Operations/Production" {
		t.Fatalf("unexpected MobaXterm session import: hosts=%d groups=%v skipped=%d", len(parsed), groups, skipped)
	}
	got := parsed[0].Host
	if got.Name != "api" || got.Host != "api.example.test" || got.Port != 2222 || got.Username != "deploy" {
		t.Fatalf("MobaXterm SSH fields did not parse: %+v", got)
	}
}

func TestSecureCRTXMLPreservesHostsAndFolderGroups(t *testing.T) {
	host := Host{Name: "router-1", Host: "router.example.test", Port: 2222, Username: "netops", Group: "Sites/West"}
	encoded, err := encodeSecureCRTXML([]string{host.Group}, []Host{host})
	if err != nil {
		t.Fatal(err)
	}
	parsed, groups, skipped, err := parseSecureCRTXML(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if skipped != 0 || len(parsed) != 1 || len(groups) != 1 || groups[0] != host.Group {
		t.Fatalf("unexpected SecureCRT import counts: hosts=%d groups=%v skipped=%d", len(parsed), groups, skipped)
	}
	got := parsed[0].Host
	if got.Name != host.Name || got.Host != host.Host || got.Port != host.Port || got.Username != host.Username || got.Group != host.Group {
		t.Fatalf("SecureCRT host fields did not round-trip: %+v", got)
	}
}

func TestSecureCRTXMLImportHandlesExportedProtocolFolders(t *testing.T) {
	data := `<?xml version="1.0"?>
<VanDyke version="3.0"><key name="Sessions"><key name="Production"><key name="ssh"><key name=""><key name="database"><string name="Hostname">db.example.test</string><dword name="[SSH2] Port">2222</dword><string name="Username">dbadmin</string></key></key></key></key></key><key name="Credentials"/><key name="Firewalls"/></VanDyke>`
	parsed, groups, skipped, err := parseSecureCRTXML([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	if skipped != 0 || len(parsed) != 1 || len(groups) != 1 || groups[0] != "Production" {
		t.Fatalf("unexpected SecureCRT import: hosts=%d groups=%v skipped=%d", len(parsed), groups, skipped)
	}
	got := parsed[0].Host
	if got.Name != "database" || got.Host != "db.example.test" || got.Port != 2222 || got.Username != "dbadmin" {
		t.Fatalf("SecureCRT session fields did not parse: %+v", got)
	}
}

func TestTabbyTransferPreservesNestedGroupNames(t *testing.T) {
	data := []byte(`version: 7
groups:
  - id: root-id
    name: Production
  - id: nested-id
    name: Database
    parentGroupId: root-id
profiles:
  - id: ssh:custom:db
    type: ssh
    name: Database host
    group: nested-id
    options:
      host: db.example.test
      port: 22
      user: dbadmin
`)
	parsed, groups, _, err := parseTabbyTransfer(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(parsed) != 1 || parsed[0].Host.Group != "Production/Database" || len(groups) != 1 || groups[0] != "Production/Database" {
		t.Fatalf("nested Tabby group was not preserved: hosts=%+v groups=%v", parsed, groups)
	}
}

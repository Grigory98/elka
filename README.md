<h1 align="center">

Elka

   <img src="build/appicon.png" width=250 alt="Elka logo"/>

</h1>

<div align="center">

   [![Discord](https://dcbadge.limes.pink/api/server/x7K9BRrQJE)](https://discord.gg/x7K9BRrQJE)
   
</div>

<h3 align="center">
   Self-hostable SSH client with sync
</h3>

Elka is a cross-platform SSH client built with [Wails v3](https://v3.wails.io/) and Go. Supports self-hosted servers for sync.

## Features
- **Encryption.** All sensitive data is encrypted locally using Argon2id and AES-256GCM.
- **Sync** encrypted data across multiple devices. Data is encrypted *before* it leaves the client!
- **Lightweight.** ~15MB binaries, ~10MB RAM.
- Cross-platform:
   - Windows, Linux, and macOS builds will be published in this repository's releases.
- Local first. You *don't have to* use a server!

## Server
Elka is designed as a local-first app, but it supports E2E encrypted sync with a self-hosted server.

## Roadmap
- [x] Encryption
- [x] Sync
- [x] SSH keys
- [ ] Host groups
- [ ] Interactive passwords
- [ ] Multiple profiles (teams?)
- [ ] Custom themes
- [ ] Shortcuts
- [ ] Android client
- [ ] CLI client
- [ ] SFTP

Something missing? Suggest more in the community Discord: [Join here](https://discord.gg/x7K9BRrQJE).

## Screenshots
<img src="assets/term-en-white.png" width="1600" alt="Elka main screen"/>
<img src="assets/term-t-white.png" width="1600" alt="Elka terminal"/>

## Development

Карта модулей и подсказки, где искать код для изменений: [PROJECT_MAP_RU.md](PROJECT_MAP_RU.md).

### Prerequisites

1. [**Go**](https://go.dev/dl/) (1.25+)
2. [**Node.js**](https://nodejs.org/en/download/current) (v24+)
3. *Preferrably* [**pnpm**](https://pnpm.io/installation#using-corepack)
4. [**Wails3 CLI**](https://v3.wails.io/getting-started/installation/)

### Build

For development: just
```
wails3 dev
```

Build a macOS app and compressed DMG in one step:

```sh
./build-macos-in-docker.sh --arch arm64 --format dmg
```

Use `--arch amd64` for Intel Macs. `--format app` builds only the `.app`, while `--format both` creates both outputs. Set a custom DMG path or mounted volume name with `--output PATH` and `--volume-name NAME`.

Debug: use remote debug and [delve](https://github.com/go-delve/delve/tree/master/Documentation/installation):
```sh
dlv debug --headless --listen=:2345 ./backend/cmd/terminator-desktop -- dev
```


Package:
```
wails3 task package
```

### Acknowledgements

Inspired by: [Termius](https://termius.com)

Built on: [Wails](https://v3.wails.io)

Beautiful UI: [shadcn](https://ui.shadcn.com)

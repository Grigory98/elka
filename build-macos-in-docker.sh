#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="terminator-cross:local"

case "${1:-$(uname -m)}" in
  arm64|aarch64)
    BUILD_ARCH="arm64"
    ;;
  amd64|x86_64)
    BUILD_ARCH="amd64"
    ;;
  *)
    printf 'Unsupported architecture: %s (use arm64 or amd64)\n' "${1:-$(uname -m)}" >&2
    exit 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required. Install and start Docker Desktop first.\n' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf 'Docker Desktop is not running. Start it and retry.\n' >&2
  exit 1
fi

if ! command -v codesign >/dev/null 2>&1; then
  printf 'codesign is required to sign the .app bundle. Install Xcode Command Line Tools with: xcode-select --install\n' >&2
  exit 1
fi

printf 'Building Docker image %s...\n' "$IMAGE_NAME"
docker build \
  --tag "$IMAGE_NAME" \
  --file "$ROOT_DIR/build/docker/Dockerfile.cross" \
  "$ROOT_DIR/build/docker"

printf 'Compiling macOS %s binary in Docker...\n' "$BUILD_ARCH"
docker run --rm \
  --volume "$ROOT_DIR:/app" \
  --workdir /app \
  --env APP_NAME=terminator \
  --env BUILD_ARCH="$BUILD_ARCH" \
  --entrypoint /bin/sh \
  "$IMAGE_NAME" \
  -ec 'cd frontend && corepack pnpm install --frozen-lockfile && pnpm run build && cd /app && /usr/local/bin/build.sh darwin "$BUILD_ARCH"'

APP_STAGE="$ROOT_DIR/bin/.terminator.app.build.app"
APP_PATH="$ROOT_DIR/bin/terminator.app"

rm -rf "$APP_STAGE"
mkdir -p "$APP_STAGE/Contents/MacOS" "$APP_STAGE/Contents/Resources"
cp "$ROOT_DIR/bin/terminator-darwin-$BUILD_ARCH" "$APP_STAGE/Contents/MacOS/terminator"
cp "$ROOT_DIR/build/darwin/icons.icns" "$APP_STAGE/Contents/Resources/icons.icns"
if [[ -f "$ROOT_DIR/build/darwin/Assets.car" ]]; then
  cp "$ROOT_DIR/build/darwin/Assets.car" "$APP_STAGE/Contents/Resources/Assets.car"
fi
cp "$ROOT_DIR/build/darwin/Info.plist" "$APP_STAGE/Contents/Info.plist"

codesign --force --deep --sign - "$APP_STAGE"

rm -rf "$APP_PATH"
mv "$APP_STAGE" "$APP_PATH"
printf 'Built app: %s\n' "$APP_PATH"

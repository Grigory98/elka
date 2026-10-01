#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="terminator-cross:local"
REQUESTED_ARCH=""
PACKAGE_FORMAT="app"
DMG_PATH=""
VOLUME_NAME="Terminator"

usage() {
  printf '%s\n' \
    'Usage: ./build-macos-in-docker.sh [arm64|amd64] [options]' \
    '' \
    'Options:' \
    '  --arch ARCH          Target architecture: arm64 or amd64 (default: host architecture)' \
    '  --format FORMAT      Output: app, dmg, or both (default: app)' \
    '  --dmg                Shortcut for --format dmg' \
    '  --both               Shortcut for --format both' \
    '  --output PATH        DMG destination (default: bin/Terminator-macos-ARCH.dmg)' \
    '  --volume-name NAME   Name shown when the DMG is mounted (default: Terminator)' \
    '  -h, --help           Show this help'
}

while (($# > 0)); do
  case "$1" in
    --arch)
      if (($# < 2)); then
        printf 'Missing value for --arch\n' >&2
        exit 2
      fi
      REQUESTED_ARCH="$2"
      shift 2
      ;;
    --arch=*)
      REQUESTED_ARCH="${1#*=}"
      shift
      ;;
    --format)
      if (($# < 2)); then
        printf 'Missing value for --format\n' >&2
        exit 2
      fi
      PACKAGE_FORMAT="$2"
      shift 2
      ;;
    --format=*)
      PACKAGE_FORMAT="${1#*=}"
      shift
      ;;
    --dmg)
      PACKAGE_FORMAT="dmg"
      shift
      ;;
    --both)
      PACKAGE_FORMAT="both"
      shift
      ;;
    --output)
      if (($# < 2)); then
        printf 'Missing value for --output\n' >&2
        exit 2
      fi
      DMG_PATH="$2"
      shift 2
      ;;
    --output=*)
      DMG_PATH="${1#*=}"
      shift
      ;;
    --volume-name)
      if (($# < 2)); then
        printf 'Missing value for --volume-name\n' >&2
        exit 2
      fi
      VOLUME_NAME="$2"
      shift 2
      ;;
    --volume-name=*)
      VOLUME_NAME="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    arm64|aarch64|amd64|x86_64)
      if [[ -n "$REQUESTED_ARCH" ]]; then
        printf 'Architecture was specified more than once\n' >&2
        exit 2
      fi
      REQUESTED_ARCH="$1"
      shift
      ;;
    *)
      printf 'Unknown option or architecture: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${REQUESTED_ARCH:-$(uname -m)}" in
  arm64|aarch64) BUILD_ARCH="arm64" ;;
  amd64|x86_64) BUILD_ARCH="amd64" ;;
  *)
    printf 'Unsupported architecture: %s (use arm64 or amd64)\n' "${REQUESTED_ARCH:-$(uname -m)}" >&2
    exit 2
    ;;
esac

case "$PACKAGE_FORMAT" in
  app|dmg|both) ;;
  *)
    printf 'Unsupported output format: %s (use app, dmg, or both)\n' "$PACKAGE_FORMAT" >&2
    exit 2
    ;;
esac

if [[ "$PACKAGE_FORMAT" != "app" ]]; then
  command -v hdiutil >/dev/null 2>&1 || {
    printf 'hdiutil is required to create a DMG (run this script on macOS).\n' >&2
    exit 1
  }
  DMG_PATH="${DMG_PATH:-$ROOT_DIR/bin/Terminator-macos-$BUILD_ARCH.dmg}"
  if [[ "$DMG_PATH" != /* ]]; then
    DMG_PATH="$ROOT_DIR/$DMG_PATH"
  fi
fi

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

if [[ "$PACKAGE_FORMAT" == "dmg" || "$PACKAGE_FORMAT" == "both" ]]; then
  mkdir -p "$(dirname "$DMG_PATH")"
  hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$APP_PATH" \
    -ov \
    -format UDZO \
    "$DMG_PATH"
  printf 'Built DMG: %s\n' "$DMG_PATH"
fi

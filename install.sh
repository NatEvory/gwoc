#!/bin/sh
# gwoc installer — downloads the release binary for this platform.
#
#   curl -fsSL https://raw.githubusercontent.com/NatEvory/gwoc/main/install.sh | sh
#
# Environment:
#   GWOC_VERSION  release tag to install (default: latest, e.g. "v0.15.0")
#   GWOC_INSTALL  install directory (default: /usr/local/bin if writable,
#                 otherwise ~/.local/bin)
set -eu

REPO="NatEvory/gwoc"

err() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

os=$(uname -s)
case "$os" in
  Linux)
    os=linux
    # The release binaries are glibc-linked; musl distros can't run them.
    if [ -e /lib/ld-musl-x86_64.so.1 ] || [ -e /lib/ld-musl-aarch64.so.1 ]; then
      err "musl-based distros (e.g. Alpine) are not supported — the release binaries require glibc"
    fi
    ;;
  Darwin) os=darwin ;;
  MINGW* | MSYS* | CYGWIN*)
    err "Windows: download gwoc-windows-x64.exe from https://github.com/$REPO/releases/latest" ;;
  *) err "unsupported OS: $os" ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) err "unsupported architecture: $arch" ;;
esac

asset="gwoc-$os-$arch"
if [ -n "${GWOC_VERSION:-}" ]; then
  base="https://github.com/$REPO/releases/download/$GWOC_VERSION"
else
  base="https://github.com/$REPO/releases/latest/download"
fi

if [ -n "${GWOC_INSTALL:-}" ]; then
  dir="$GWOC_INSTALL"
elif [ -w /usr/local/bin ]; then
  dir=/usr/local/bin
else
  dir="$HOME/.local/bin"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf 'Downloading %s (%s)...\n' "$asset" "${GWOC_VERSION:-latest}"
curl -fsSL -o "$tmp/$asset" "$base/$asset" || err "download failed: $base/$asset"
curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" || err "download failed: $base/SHA256SUMS"

cd "$tmp"
if command -v sha256sum >/dev/null 2>&1; then
  grep " $asset\$" SHA256SUMS | sha256sum -c - >/dev/null || err "checksum mismatch for $asset"
elif command -v shasum >/dev/null 2>&1; then
  grep " $asset\$" SHA256SUMS | shasum -a 256 -c - >/dev/null || err "checksum mismatch for $asset"
else
  printf 'warning: no sha256sum/shasum found, skipping checksum verification\n' >&2
fi

mkdir -p "$dir"
install -m 755 "$tmp/$asset" "$dir/gwoc" 2>/dev/null || {
  mv "$tmp/$asset" "$dir/gwoc" && chmod 755 "$dir/gwoc"
} || err "could not write to $dir (set GWOC_INSTALL to a writable directory)"

version=$("$dir/gwoc" --version) || err "installed binary failed to run on this system"
printf 'Installed %s to %s/gwoc\n' "$version" "$dir"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) printf 'note: %s is not on your PATH\n' "$dir" ;;
esac

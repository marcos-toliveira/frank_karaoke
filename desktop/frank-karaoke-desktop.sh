#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="${SCRIPT_DIR}/extension"

# Detect Chrome or Chromium
CHROME_BIN=""
for bin in google-chrome google-chrome-stable chromium-browser chromium; do
    if command -v "$bin" >/dev/null 2>&1; then
        CHROME_BIN="$bin"
        break
    fi
done

if [ -z "$CHROME_BIN" ]; then
    echo "Erro: Google Chrome ou Chromium não encontrado no PATH." >&2
    exit 1
fi

echo "Iniciando Frank Karaoke Desktop via ${CHROME_BIN}..."
exec "$CHROME_BIN" \
    --app="https://www.youtube.com" \
    --load-extension="${EXT_DIR}" \
    --ozone-platform=x11 \
    --autoplay-policy=no-user-gesture-required \
    "$@"

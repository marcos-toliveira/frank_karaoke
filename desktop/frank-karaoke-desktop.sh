#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="${SCRIPT_DIR}/extension"
PROFILE_DIR="${HOME}/.config/frank-karaoke-profile"

mkdir -p "${PROFILE_DIR}"
touch "${PROFILE_DIR}/First Run"

# Prefer direct official binaries, avoiding broken wrappers in ~/.local/bin
CHROME_BIN=""
for bin in /opt/google/chrome/chrome /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium /usr/bin/brave-browser; do
    if [ -x "$bin" ]; then
        CHROME_BIN="$bin"
        break
    fi
done

if [ -z "$CHROME_BIN" ]; then
    echo "Erro: Navegador Chromium compatível não encontrado em /usr/bin ou /opt." >&2
    exit 1
fi

if [ "$1" = "--setup" ] || [ "$1" = "--extensions" ]; then
    echo "Abrindo gerenciador de extensões no perfil dedicado..."
    echo "Dica: Ative 'Modo do desenvolvedor' e clique em 'Carregar sem compactação' apontando para: ${EXT_DIR}"
    exec "$CHROME_BIN" \
        --user-data-dir="${PROFILE_DIR}" \
        --no-first-run \
        --no-default-browser-check \
        "chrome://extensions"
fi

echo "Iniciando Frank Karaoke Desktop via ${CHROME_BIN}..."

exec "$CHROME_BIN" \
    --user-data-dir="${PROFILE_DIR}" \
    --app="https://www.youtube.com" \
    --load-extension="${EXT_DIR}" \
    --no-first-run \
    --no-default-browser-check \
    --disable-fre \
    --class="frank-karaoke" \
    --ozone-platform=x11 \
    --autoplay-policy=no-user-gesture-required \
    --disable-features=WebRtcAllowInputVolumeAdjustment \
    "$@"

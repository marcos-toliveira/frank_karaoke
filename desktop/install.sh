#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"

mkdir -p "${APP_DIR}" "${ICON_DIR}"

cp "${SCRIPT_DIR}/frank-karaoke.desktop" "${APP_DIR}/"
cp "${SCRIPT_DIR}/icon.png" "${ICON_DIR}/frank-karaoke.png"

chmod +x "${SCRIPT_DIR}/frank-karaoke-desktop.sh"
chmod +x "${APP_DIR}/frank-karaoke.desktop"

# Update desktop database if tool is available
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${APP_DIR}" 2>/dev/null || true
fi

echo "========================================================"
echo "✅ Frank Karaoke Desktop instalado com sucesso!"
echo "Você já pode encontrá-lo no menu de aplicativos do KDE"
echo "ou executá-lo diretamente via terminal:"
echo "${SCRIPT_DIR}/frank-karaoke-desktop.sh"
echo "========================================================"

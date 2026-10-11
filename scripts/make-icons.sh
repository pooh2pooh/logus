#!/usr/bin/env bash
# SVG → favicon/PNG/манифест. Иконка-источник: icon.svg в корне репозитория.
# Требуется rsvg-convert и/или ImageMagick; при отсутствии — деградируем мягко.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="icon.svg"

if [ ! -f "$SRC" ]; then
  echo "make-icons: нет $SRC — пропускаем" >&2
  exit 0
fi

render() { # размер, файл
  local size="$1" out="$2"
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$SRC" -o "$out"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -resize "${size}x${size}" "$SRC" "$out"
  else
    return 1
  fi
}

if ! render 192 icon-192.png; then
  echo "make-icons: нет рендерера SVG — PNG/ICO не созданы" >&2
  exit 0
fi
render 512 icon-512.png
render 180 apple-touch-icon.png
cp icon-192.png android-chrome-192x192.png
cp icon-512.png android-chrome-512x512.png

# favicon.ico из 32px PNG (если есть ImageMagick).
if command -v magick >/dev/null 2>&1; then
  render 32 /tmp/logus-favicon-32.png
  magick /tmp/logus-favicon-32.png favicon.ico
  rm -f /tmp/logus-favicon-32.png
fi

echo "make-icons: готово (icon-192/512, apple-touch-icon, android-chrome, favicon)"

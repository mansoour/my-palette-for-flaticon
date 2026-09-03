#!/usr/bin/env bash
# Package the extension into a Chrome Web Store-ready zip.
# Usage: bash scripts/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
NAME="my-palette-for-flaticon-${VERSION}"
OUT_DIR="dist"
OUT_ZIP="${OUT_DIR}/${NAME}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_ZIP"

echo "Packaging version ${VERSION} -> ${OUT_ZIP}"

# icons/github/ holds GitHub-profile/README branding assets, not anything the extension itself
# references — excluded so the Web Store upload isn't carrying unrelated weight.
if command -v zip >/dev/null 2>&1; then
  zip -r "$OUT_ZIP" manifest.json icons src -x "*.DS_Store" -x "Thumbs.db" -x "icons/github/*"
else
  # Fall back to Python's zipfile module when the `zip` binary isn't available
  # (e.g. Git Bash on Windows).
  PY=$(command -v python || command -v python3)
  "$PY" - "$OUT_ZIP" << 'PY'
import os, sys, zipfile

out_zip = sys.argv[1]
paths = ["manifest.json", "icons", "src"]

with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    for base in paths:
        if os.path.isfile(base):
            zf.write(base, base)
            continue
        for dirpath, _dirs, files in os.walk(base):
            if os.path.normpath(dirpath).endswith(os.path.normpath("icons/github")):
                continue
            for f in files:
                if f in (".DS_Store", "Thumbs.db"):
                    continue
                full = os.path.join(dirpath, f)
                zf.write(full, full)
PY
fi

echo "Done: ${OUT_ZIP}"

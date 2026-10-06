#!/usr/bin/env bash
# Copies scripts/shared/*.ts into every plugin that already vendors it.
# Plugins cannot import across plugin folders, so each one keeps its own copy.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

for source in "$root"/scripts/shared/*.ts; do
  file="$(basename "$source")"
  for target in "$root"/plugins/*/src/shared/"$file"; do
    [ -e "$target" ] || continue
    cp "$source" "$target"
    echo "synced ${target#"$root"/}"
  done
done

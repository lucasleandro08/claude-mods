#!/usr/bin/env bash
# Validates and tests every plugin with the Claude Code CLI.
# CLAUDE_BIN overrides the CLI path; pass plugin names to check only those.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
claude_bin="${CLAUDE_BIN:-claude}"
failed=0

if ! command -v "$claude_bin" >/dev/null 2>&1; then
  echo "claude CLI not found; set CLAUDE_BIN" >&2
  exit 1
fi

"$root/scripts/sync-shared.sh" >/dev/null
if ! git -C "$root" diff --quiet -- plugins/*/src/shared; then
  echo "plugins/*/src/shared drifted from scripts/shared: commit the sync" >&2
  failed=1
fi

plugins=("$@")
[ ${#plugins[@]} -eq 0 ] && plugins=($(ls "$root/plugins"))

for name in "${plugins[@]}"; do
  dir="$root/plugins/$name"
  if "$claude_bin" plugin validate "$dir" >/tmp/claude-mods-validate.log 2>&1; then
    validate="ok"
  else
    validate="FAILED"; failed=1; cat /tmp/claude-mods-validate.log
  fi
  tests="$("$claude_bin" plugin test "$dir" 2>&1)"
  summary="$(echo "$tests" | grep -E '^ [0-9]+ (pass|fail)' | tr -s ' \n' ' ')"
  if echo "$tests" | grep -qE '^ [1-9][0-9]* fail'; then
    failed=1; echo "$tests" | grep -A6 '(fail)'
  fi
  printf '%-16s validate: %-6s tests:%s\n' "$name" "$validate" "$summary"
done

exit $failed

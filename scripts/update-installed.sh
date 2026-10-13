#!/usr/bin/env bash
# Refreshes the installed copy of every mod whose version in this repo is newer.
# The app loads that copy at startup; /reload-plugins reads the folder, so without this a restart brings old versions back.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
claude_bin="${CLAUDE_BIN:-claude}"
installed="$HOME/.claude/plugins/installed_plugins.json"
for manifest in "$root"/plugins/*/.claude-plugin/plugin.json; do
  name="$(basename "$(dirname "$(dirname "$manifest")")")"
  repo_version="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$manifest")"
  installed_version="$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));p=d.get('plugins',d).get(sys.argv[2]) or [{}];print(p[0].get('version',''))" "$installed" "$name@dracula-mods")"
  if [ -n "$installed_version" ] && [ "$installed_version" != "$repo_version" ]; then
    echo "$name: $installed_version -> $repo_version"
    "$claude_bin" plugin update "$name@dracula-mods"
  fi
done
echo "Done. Restart Claude Code (or open a new session) to load the updated mods."

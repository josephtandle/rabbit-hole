#!/usr/bin/env bash
# Reverses install.sh. Leaves $RABBIT_HOLE_HOME (config, logs, parking lots) in place.
set -euo pipefail

RH_HOME="${RABBIT_HOLE_HOME:-$HOME/.rabbit-hole}"
CLAUDE_SKILL="$HOME/.claude/skills/rabbit-hole"
CODEX_SKILL="$HOME/.codex/skills/rabbit-hole"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

for link in "$CLAUDE_SKILL" "$CODEX_SKILL"; do
  if [ -L "$link" ]; then
    rm "$link"
    echo "removed  $link"
  fi
done

if [ -f "$SETTINGS" ] && command -v node >/dev/null 2>&1; then
  node - "$SETTINGS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let settings;
try { settings = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch (e) { process.exit(0); }
if (!settings.hooks) process.exit(0);
let changed = false;
for (const event of Object.keys(settings.hooks)) {
  const list = settings.hooks[event];
  if (!Array.isArray(list)) continue;
  const kept = list.filter((g) => !(Array.isArray(g.hooks) && g.hooks.some((h) => typeof h.command === 'string' && h.command.includes('rabbit-hole/hooks/claude-code/'))));
  if (kept.length !== list.length) { changed = true; console.log('removed  ' + event + ' hook from ' + file); }
  if (kept.length) settings.hooks[event] = kept; else delete settings.hooks[event];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;
if (changed) fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
NODE
fi

echo "Rabbit Hole hooks and skill links are gone. State kept at $RH_HOME (delete it yourself if you want a clean slate)."

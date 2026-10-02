#!/usr/bin/env bash
# Rabbit Hole installer. Idempotent: safe to run again after a git pull.
# - copies config.example.json to $RABBIT_HOLE_HOME/config.json if absent
# - symlinks this folder into ~/.claude/skills and ~/.codex/skills
# - merges the two Claude Code hooks into ~/.claude/settings.json (no duplicates)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RH_HOME="${RABBIT_HOLE_HOME:-$HOME/.rabbit-hole}"
CLAUDE_SKILL="$HOME/.claude/skills/rabbit-hole"
CODEX_SKILL="$HOME/.codex/skills/rabbit-hole"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"

if ! command -v node >/dev/null 2>&1; then
  echo "Rabbit Hole needs Node 18 or newer on PATH." >&2
  exit 1
fi

mkdir -p "$RH_HOME/sessions"
if [ ! -f "$RH_HOME/config.json" ]; then
  cp "$SRC/config.example.json" "$RH_HOME/config.json"
  echo "created  $RH_HOME/config.json"
else
  echo "kept     $RH_HOME/config.json"
fi

link_skill() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$SRC" ]; then
    echo "kept     $target"
  elif [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "skipped  $target already exists and is not a symlink; remove it to link the skill" >&2
  else
    ln -sfn "$SRC" "$target"
    echo "linked   $target -> $SRC"
  fi
}
link_skill "$CLAUDE_SKILL"
link_skill "$CODEX_SKILL"

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
node - "$SETTINGS" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let settings = {};
try { settings = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch (e) { console.error('settings.json is not valid JSON: ' + file); process.exit(1); }
settings.hooks = settings.hooks || {};
const wanted = [
  { event: 'UserPromptSubmit', matcher: null, marker: 'rabbit-hole/hooks/claude-code/user-prompt-submit.sh', command: 'bash "$HOME/.claude/skills/rabbit-hole/hooks/claude-code/user-prompt-submit.sh"' },
  { event: 'PreToolUse', matcher: '*', marker: 'rabbit-hole/hooks/claude-code/pre-tool-use.sh', command: 'bash "$HOME/.claude/skills/rabbit-hole/hooks/claude-code/pre-tool-use.sh"' },
];
let changed = false;
for (const w of wanted) {
  const list = Array.isArray(settings.hooks[w.event]) ? settings.hooks[w.event] : [];
  const present = list.some((g) => Array.isArray(g.hooks) && g.hooks.some((h) => typeof h.command === 'string' && h.command.includes(w.marker)));
  if (present) { console.log('kept     ' + w.event + ' hook in ' + file); continue; }
  const group = { hooks: [{ type: 'command', command: w.command, timeout: 10 }] };
  if (w.matcher) group.matcher = w.matcher;
  list.push(group);
  settings.hooks[w.event] = list;
  changed = true;
  console.log('added    ' + w.event + ' hook to ' + file);
}
if (changed) fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
NODE

cat <<MSG

Rabbit Hole is installed and always on for Claude Code.
State: $RH_HOME
CLI:   $SRC/bin/rabbit-hole  (add to PATH or alias it)

Codex has no hooks, so the skill runs from its own instructions. Add this line to your AGENTS.md:
  Load the rabbit-hole skill (~/.codex/skills/rabbit-hole/SKILL.md) at the start of every session and keep it on for the whole session.
MSG

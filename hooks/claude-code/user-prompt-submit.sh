#!/usr/bin/env bash
# Rabbit Hole: UserPromptSubmit hook for Claude Code.
# Reads the hook JSON on stdin, keeps session state in $RABBIT_HOLE_HOME
# (default ~/.rabbit-hole) and prints a short context block at most once per
# cadence. Advisory only: always exits 0, never more than 12 lines.
set -u
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOOK_DIR/../../lib/user-prompt-submit.js"
if ! command -v node >/dev/null 2>&1; then
  cat >/dev/null
  exit 0
fi
node "$LIB" 2>/dev/null || true
exit 0

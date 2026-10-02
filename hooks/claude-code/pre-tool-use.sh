#!/usr/bin/env bash
# Rabbit Hole: PreToolUse hook for Claude Code (mechanical loop guard).
# Reads the hook JSON on stdin, tracks the last 10 tool calls per session and
# prints a one-line advisory when a loop signal trips. Never blocks: exit 0.
set -u
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOOK_DIR/../../lib/pre-tool-use.js"
if ! command -v node >/dev/null 2>&1; then
  cat >/dev/null
  exit 0
fi
node "$LIB" 2>/dev/null || true
exit 0

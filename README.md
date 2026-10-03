# Rabbit Hole

An always-on, advisory focus guard for AI coding sessions. Once installed it watches every Claude Code session for three things, drift, loops and fatigue, and says nothing until a signal trips. When it speaks, it is short: one checkpoint, three choices, the recommended one first. It never blocks a tool call, never forces a stop, and respects an override.

It is a skill (a `SKILL.md` the assistant follows) plus two small Claude Code hooks that give the skill memory and mechanical evidence: how long the session has run, what time it is, whether the same tool call keeps repeating, how many topics have been opened. Everything stays on your machine.

## Install

Requires Node 18 or newer and bash. No npm dependencies.

```bash
git clone https://github.com/josephtandle/rabbit-hole.git ~/rabbit-hole
~/rabbit-hole/install.sh
```

`install.sh` is idempotent. It:

1. creates `~/.rabbit-hole/config.json` from `config.example.json` if it does not exist
2. symlinks the repo into `~/.claude/skills/rabbit-hole` and `~/.codex/skills/rabbit-hole`
3. merges two hooks into `~/.claude/settings.json` without touching your other hooks and without duplicating on re-run
4. prints the one line to add to `AGENTS.md` for Codex

Optional: put `bin/rabbit-hole` on your PATH, for example `ln -s ~/rabbit-hole/bin/rabbit-hole ~/.local/bin/rabbit-hole`.

`uninstall.sh` removes the symlinks and the two hooks and leaves `~/.rabbit-hole` (your config, logs and resume file) in place.

### Claude Code

The hooks do the work. `examples/claude-settings.json` shows exactly what the installer adds:

- `UserPromptSubmit` runs `hooks/claude-code/user-prompt-submit.sh`
- `PreToolUse` (all tools) runs `hooks/claude-code/pre-tool-use.sh`

Both exit 0 in every case and finish in well under a second.

### Codex (and any surface without hooks)

Codex has no hooks, so the skill runs on its own instructions. Add this to your `AGENTS.md`:

```text
Load the rabbit-hole skill (~/.codex/skills/rabbit-hole/SKILL.md) at the start of every session and keep it on for the whole session.
```

Without the hooks the assistant still runs the intake, the needle-moving check, the still-broken rule, the thread budget and the checkpoint format; it just has no clock or tool trace to lean on.

## How always-on works

- **First turn of a session:** the hook asks the assistant to run a one-question intake. What does done look like, in one sentence, and how strict should the guard be: `strict`, `mid` (default) or `loose`. If your first prompt already says what done is, the assistant confirms it in one line instead of asking. The answer is stored per session, so compaction cannot lose it. If a previous session ended with `rabbit-hole done`, its resume point is shown here too.
- **Every prompt:** the hook updates the session (prompt count, rough topic-switch count, "still broken" streak) and, at most once per `cadenceMinutes`, injects a five-line reminder: elapsed time, local time, whether you are inside quiet hours, the mission, the strictness and how much of the intervention budget is used. The reminder tells the assistant to run a silent check and speak only at medium or high confidence.
- **Every tool call:** the loop guard records the tool name, a hash of its input and a hash of its target (last 10 calls). Three identical calls in a row, the same two calls alternating A-B-A-B, or 5 or more of the last 10 calls hitting the same target (the same normalised shell command, the same file path) adds a one-line advisory to the assistant's context: re-plan before the next call. The call itself still runs. Everyday tools such as Bash, Read and Edit are never counted by name alone, so a Bash-heavy session stays quiet; other tools (MCP tools, for example) still trip at 5 uses in 10 calls with varying input. A churn trip writes a short form of the target (file name, or the command with numbers and quoted strings removed) to the log.
- **Silence is the default.** Low confidence means nothing is said. The first three topic switches are free. After you override a checkpoint, that signal stays quiet until there is new evidence.

## The three risks it watches

**Drift.** Work that moved away from the declared outcome: a side thread, shopping, speculative research, polish while the mission is delivery. The needle-moving rule asks "does this materially move the outcome forward?" before going deeper into cosmetic or preference work. A thread count with a budget catches the other kind of drift: four unresolved threads get a thread map and one re-anchor question; at most two of those per session, then one-liners.

**Loops.** Mechanical signals from the tool trace, plus the "still broken" rule: three turns in a row that read as still failing stop the patch cycle. The assistant names the assumption that may be wrong and asks one diagnostic question before the next change.

**Fatigue.** A late clock alone is not a signal. Inside your quiet hours AND evidence of going in circles (a loop trip, edit-and-revert churn, a rising still-broken count, low energy declared at intake) fires one fatigue check per session.

## The checkpoint format

```text
Rabbit Hole check:
- Mission: <one short line>
- Risk: <drift|looping|fatigue>
- Why: <one short line>

Choices:
- <recommended choice>
- <choice 2>
- <choice 3>
```

Three choices at most, recommended first, whole thing under eight lines. Templates for each risk live in `references/prompt-templates.md`; every signal and threshold is in `references/signals.md`.

## Park, don't chase

A tangent mid-task gets parked, not started:

```bash
rabbit-hole park "try the new terminal font"
```

appends a timestamped line to the parking lot (`PARKING-LOT.md` in the current project by default) and points back at the current step. Pick parked items up on purpose, not by accident.

## Config

`~/.rabbit-hole/config.json`, all keys optional:

```json
{
  "mission": "",
  "strictness": "mid",
  "cadenceMinutes": 15,
  "quietHours": { "start": "23:00", "end": "06:00" },
  "timezone": "",
  "parkingLot": "PARKING-LOT.md"
}
```

See `config.md` for what each key does. `RABBIT_HOLE_HOME` moves the whole state directory somewhere else.

## CLI

```text
rabbit-hole park "<text>"                      park a tangent or idea
rabbit-hole mission "<outcome>" [--strictness strict|mid|loose]
rabbit-hole check <drift|looping|fatigue> ["why"] [--result accepted|overridden]
rabbit-hole check --result accepted|overridden
rabbit-hole done ["next step"]                 session summary plus one resume line
rabbit-hole log [--last N]
rabbit-hole stats                              checks fired, accepted vs overridden, trips by kind
rabbit-hole config                             effective config
```

`done` prints the outcome, duration, checks fired, loop trips, topic switches and parked count, and appends one line to `~/.rabbit-hole/resume.md` so the next session starts without re-explaining. `stats` is the feedback loop: when a signal is overridden more than it is accepted, raise its threshold.

## Privacy

Everything stays local. State lives in `~/.rabbit-hole`: one JSON file per session, `log.jsonl` with trips and checkpoints, `resume.md`. The hooks store prompt counts, a keyword set for the rough topic counter, the mission sentence you gave, and hashes of tool inputs. Prompt text and tool inputs are not written anywhere. No network calls, no telemetry, no dependencies.

## Tests

```bash
node --test tests/
```

Feeds fixture hook JSON through both hooks and exercises every CLI command against a temporary state directory.

## Attribution

Rabbit Hole 2.0 borrows ideas, and in some places adapted wording, from these MIT-licensed projects:

- [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd): the "still broken" override (three failing turns means stop iterating and name the wrong assumption) and the one-next-action close.
- [Leonw98/adhd-claude-skill](https://github.com/Leonw98/adhd-claude-skill): outcome plus strictness captured up front, session state on disk, append-only parked items, the `[outcome: ...]` prefix.
- [emircbngl/claude-adhd-productivity](https://github.com/emircbngl/claude-adhd-productivity): the parking lot, `/park` and `/done`, and the resumption-point line.
- [bmdhodl/agent47](https://github.com/bmdhodl/agent47): the PreToolUse loop guard, identical-call and fuzzy frequency detection over a sliding window of 10, and the trace log.
- [lazyfoxjumps/Loft-Hours](https://github.com/lazyfoxjumps/Loft-Hours): the one-question intake and check-in shape, energy as a fatigue input, and per-session logs that roll up.
- [fercreek/focus-adhd](https://github.com/fercreek/focus-adhd): the decision budget, response size scaled to decisions the reader must make, three options at most.

The thread-count signal with an intervention budget is an original rewrite of an idea seen in the wild; no text was reused from unlicensed sources.

## License

All Sorted Personal Use License: use it for yourself, never sell or redistribute it. See LICENSE.

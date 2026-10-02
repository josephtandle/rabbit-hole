'use strict';
// PreToolUse hook logic: a mechanical loop guard. Keeps the last 10 tool calls
// per session and prints a one-line advisory (as PreToolUse additionalContext)
// when a loop signal trips. Never blocks. Every trip goes to log.jsonl.
// Loop-detection idea adapted from bmdhodl/agent47 (MIT).
//
// Four signals, checked in this order:
//   loop-identical    same tool and same input 3 times in a row
//   loop-alternation  two (tool + input) pairs alternating A-B-A-B-A-B
//   loop-churn        a workhorse tool (Bash, Read, Edit, ...) aimed at the same
//                     target 5 or more times in the last 10 calls
//   loop-frequency    any other tool used 5 or more times in the last 10 calls
//                     with varying input
// Workhorse tools are never counted by name alone: an agent calls Bash or Read
// for most of its work, so the raw count carries no signal.
const c = require('./common');

const WINDOW = 10;
const IDENTICAL_RUN = 3;
const FREQUENCY_LIMIT = 5;
const COOLDOWN_CALLS = 3;

// Trace entries are { t: tool name, h: hash of the full input, k: hash of the
// target (workhorse tools only), ts }. Only hashes are stored.
function detect(trace) {
  const n = trace.length;
  if (n >= IDENTICAL_RUN) {
    const tail = trace.slice(-IDENTICAL_RUN);
    if (tail.every((e) => e.t === tail[0].t && e.h === tail[0].h)) {
      return { kind: 'loop-identical', detail: { tool: tail[0].t, repeats: IDENTICAL_RUN } };
    }
  }
  if (n >= 6) {
    // Compares (tool + input hash) pairs, never tool names alone: Bash, Read,
    // Bash, Read with different inputs each time is ordinary work.
    const tail = trace.slice(-6);
    const a = tail[0];
    const b = tail[1];
    const key = (e) => e.t + ':' + e.h;
    if (key(a) !== key(b) && tail.every((e, i) => key(e) === key(i % 2 === 0 ? a : b))) {
      return { kind: 'loop-alternation', detail: { tools: [a.t, b.t], cycles: 3 } };
    }
  }
  // Churn: the call being made now is a workhorse tool aimed at a target that
  // tool has already hit often in the window. Only the current call can trip
  // it, so the advisory always arrives on a call that is part of the churn.
  const cur = trace[n - 1];
  if (cur && cur.k && c.isWorkhorse(cur.t)) {
    const hits = trace.filter((e) => e.t === cur.t && e.k === cur.k).length;
    if (hits >= FREQUENCY_LIMIT) {
      return { kind: 'loop-churn', detail: { tool: cur.t, count: hits, window: WINDOW } };
    }
  }
  const counts = {};
  const hashes = {};
  for (const e of trace) {
    if (c.isWorkhorse(e.t)) continue;
    counts[e.t] = (counts[e.t] || 0) + 1;
    (hashes[e.t] = hashes[e.t] || new Set()).add(e.h);
  }
  for (const tool of Object.keys(counts)) {
    if (counts[tool] >= FREQUENCY_LIMIT && hashes[tool].size >= 2) {
      return { kind: 'loop-frequency', detail: { tool, count: counts[tool], window: WINDOW } };
    }
  }
  return null;
}

function message(trip) {
  const d = trip.detail;
  if (trip.kind === 'loop-identical') {
    return 'Rabbit Hole loop signal: ' + d.tool + ' called ' + d.repeats + ' times in a row with identical input. Re-plan before the next call: state what changed, or change the approach.';
  }
  if (trip.kind === 'loop-alternation') {
    return 'Rabbit Hole loop signal: ' + d.tools.join(' / ') + ' alternating for ' + d.cycles + ' cycles with no new input. Re-plan before the next call; name the assumption that keeps failing.';
  }
  if (trip.kind === 'loop-churn') {
    return 'Rabbit Hole loop signal: ' + d.tool + ' hit the same target ' + d.count + ' times in the last ' + d.window + ' calls' + (d.target ? ' (' + d.target + ')' : '') + '. Re-plan before the next call: what would prove the current approach wrong?';
  }
  return 'Rabbit Hole loop signal: ' + d.tool + ' used ' + d.count + ' times in the last ' + d.window + ' calls with varying input. Re-plan before the next call: what would prove the current approach wrong?';
}

function run(input, now) {
  now = now || new Date();
  const sessionId = input.session_id || 'default';
  const tool = String(input.tool_name || 'unknown');
  const s = c.loadSession(sessionId, now);
  s.toolCalls += 1;
  const target = c.toolTarget(tool, input.tool_input);
  const entry = { t: tool, h: c.hashInput(input.tool_input), ts: now.toISOString() };
  if (target) entry.k = c.hashInput(target.key);
  s.trace.push(entry);
  if (s.trace.length > WINDOW) s.trace = s.trace.slice(-WINDOW);

  let output = '';
  const trip = detect(s.trace);
  if (trip) {
    if (trip.kind === 'loop-churn' && target) trip.detail.target = target.label;
    const last = s.lastLoopTrip;
    const cooled = !last || last.kind !== trip.kind || s.toolCalls - last.atCall >= COOLDOWN_CALLS;
    if (cooled) {
      s.lastLoopTrip = { kind: trip.kind, atCall: s.toolCalls };
      c.appendLog({ session: s.id, kind: trip.kind, detail: trip.detail });
      output = JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message(trip) },
      });
    }
  }
  c.saveSession(s);
  return output;
}

module.exports = { run, detect, message, WINDOW, IDENTICAL_RUN, FREQUENCY_LIMIT, COOLDOWN_CALLS };

if (require.main === module) {
  try {
    const out = run(c.readStdinJson());
    if (out) process.stdout.write(out + '\n');
  } catch (err) {
    // advisory only: never block a tool call
  }
  process.exit(0);
}

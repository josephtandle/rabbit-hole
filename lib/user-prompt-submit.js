'use strict';
// UserPromptSubmit hook logic. Reads Claude Code hook JSON on stdin, keeps
// per-session state, prints a compact context block on stdout (which Claude
// Code injects into the conversation). Advisory only. Never more than 12 lines.
const c = require('./common');

const STOPWORDS = new Set('the and for with that this from into your what when then than they them have been were will just also about over under some more most very like make made need want does done only each other there here where which while after before could would should please thank thanks okay yeah really still again'.split(' '));

const STILL_BROKEN = /\b(still (broken|failing|fails|not working|doesn'?t work|does not work|the same|wrong|erroring|crashing)|same (error|problem|issue|failure)|not fixed|didn'?t (work|fix|help)|did not (work|fix|help)|no change|nothing changed|that did nothing|still (get|getting|see|seeing) the)\b/i;

function contentWords(text) {
  const words = String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) || [];
  const out = new Set();
  for (const w of words) if (!STOPWORDS.has(w)) out.add(w);
  return out;
}

function overlapRatio(words, pool) {
  if (!words.size) return 1;
  let hit = 0;
  for (const w of words) if (pool.has(w)) hit++;
  return hit / words.size;
}

function detectStrictness(text) {
  const m = /\b(strict|loose|mid|medium)\b/i.exec(String(text || ''));
  if (!m) return '';
  const v = m[1].toLowerCase();
  return v === 'medium' ? 'mid' : v;
}

function oneLine(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

function run(input, now) {
  now = now || new Date();
  const cfg = c.loadConfig();
  const sessionId = input.session_id || 'default';
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const s = c.loadSession(sessionId, now);
  const lines = [];

  s.promptCount += 1;
  s.lastPromptAt = now.toISOString();
  const words = contentWords(prompt);

  if (s.promptCount === 1) {
    s.intakeAskedAt = now.toISOString();
    s.lastCheckAt = now.toISOString();
    s.keywords = Array.from(words).slice(0, 400);
    lines.push('Rabbit Hole is on for this session (advisory, silent until a signal trips).');
    lines.push('Intake, first turn only, one question: ask for the outcome of this session in one sentence plus a strictness level (strict / mid / loose, default mid). If this prompt already states the outcome, confirm it in one line instead of asking. Then start the work.');
    if (cfg.mission) lines.push('Configured default mission: ' + oneLine(cfg.mission, 160));
    const resume = c.lastResumeLine();
    if (resume) lines.push('Last resume point: ' + oneLine(resume, 200));
    lines.push('Strictness default: ' + cfg.strictness + '. Record the answer with: rabbit-hole mission "<outcome>" --strictness <level>');
    c.saveSession(s);
    return lines.join('\n');
  }

  // Capture the intake answer as the session mission (fallback when the CLI is not used).
  if (s.intakeAskedAt && !s.missionCaptured && !prompt.startsWith('/')) {
    s.missionCaptured = true;
    if (!s.mission && prompt.trim().split(/\s+/).length >= 3) s.mission = oneLine(prompt, 200);
    const strict = detectStrictness(prompt);
    if (strict && !s.strictness) s.strictness = strict;
    s.keywords = Array.from(new Set([...s.keywords, ...words])).slice(0, 400);
  } else {
    // Topic switch heuristic: a prompt with enough content words that barely overlaps what came before.
    const pool = new Set(s.keywords);
    if (words.size >= 5 && pool.size >= 5 && overlapRatio(words, pool) < 0.15) {
      s.topicSwitches += 1;
      const n = s.topicSwitches;
      if (n === 4 || (n > 4 && (n - 4) % 3 === 0)) {
        const detail = n === 4
          ? 'Rabbit Hole signal: ' + n + ' topic switches this session without a return. Run the drift self-check; if the threads are unresolved, post a thread map (each thread, status, where it stopped) and one re-anchor question.'
          : 'Rabbit Hole signal: branching again (' + n + ' topic switches). One line only: is this intentional?';
        lines.push(detail);
        c.appendLog({ session: s.id, kind: 'topic-switch', detail: { count: n } });
      }
    }
    s.keywords = Array.from(new Set([...s.keywords, ...words])).slice(0, 400);
  }

  // Still-broken counter.
  if (STILL_BROKEN.test(prompt)) {
    s.stillBroken += 1;
    if (s.stillBroken === 3) {
      lines.push('Rabbit Hole signal: 3 turns in a row read as "still failing". Stop iterating. Name the assumption that may be wrong and ask one diagnostic question before the next change.');
      c.appendLog({ session: s.id, kind: 'still-broken', detail: { count: s.stillBroken } });
    }
  } else {
    s.stillBroken = 0;
  }

  // Periodic reminder, at most once per cadenceMinutes.
  const last = s.lastCheckAt ? new Date(s.lastCheckAt) : new Date(s.startedAt);
  if (c.minutesBetween(last, now) >= cfg.cadenceMinutes) {
    s.lastCheckAt = now.toISOString();
    const clock = c.localClock(cfg, now);
    const quiet = c.inQuietHours(cfg, now);
    const elapsed = c.minutesBetween(new Date(s.startedAt), now);
    const stats = c.sessionStats(s, c.readLog());
    const mission = s.mission || cfg.mission || 'not declared, infer it from the work';
    const strictness = s.strictness || cfg.strictness;
    lines.push('Rabbit Hole reminder (silent self-check, do not mention unless a signal trips):');
    lines.push('- Elapsed: ' + elapsed + ' min | Local time: ' + clock.hhmm + (quiet ? ' (inside quiet hours)' : ' (outside quiet hours)'));
    lines.push('- Mission: ' + oneLine(mission, 160));
    lines.push('- Strictness: ' + strictness + ' | Topic switches: ' + s.topicSwitches + ' (first 3 free) | Full checkpoints used: ' + Math.min(stats.checks, 2) + '/2 | Loop trips: ' + stats.loops);
    lines.push('- Run the drift / loop / fatigue check now. Speak only at medium or high confidence, using the "Rabbit Hole check:" format with Mission, Risk, Why and at most 3 choices, recommended first. Otherwise say nothing about this.');
  }

  c.saveSession(s);
  return lines.slice(0, 12).join('\n');
}

module.exports = { run, contentWords, STILL_BROKEN };

if (require.main === module) {
  try {
    const out = run(c.readStdinJson());
    if (out) process.stdout.write(out + '\n');
  } catch (err) {
    // advisory only: never fail the prompt
  }
  process.exit(0);
}

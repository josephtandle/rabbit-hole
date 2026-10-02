'use strict';
// Shared helpers for the Rabbit Hole hooks and CLI. Node builtins only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CONFIG = {
  mission: '',
  strictness: 'mid',
  cadenceMinutes: 15,
  quietHours: { start: '23:00', end: '06:00' },
  timezone: '',
  parkingLot: 'PARKING-LOT.md',
};

const STRICTNESS = ['strict', 'mid', 'loose'];

function home() {
  return process.env.RABBIT_HOLE_HOME || path.join(os.homedir(), '.rabbit-hole');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function configPath() {
  return path.join(home(), 'config.json');
}

function loadConfig() {
  const raw = readJson(configPath(), {});
  const cfg = Object.assign({}, DEFAULT_CONFIG, raw || {});
  cfg.quietHours = Object.assign({}, DEFAULT_CONFIG.quietHours, (raw && raw.quietHours) || {});
  if (!STRICTNESS.includes(cfg.strictness)) cfg.strictness = 'mid';
  const cadence = Number(cfg.cadenceMinutes);
  cfg.cadenceMinutes = Number.isFinite(cadence) && cadence > 0 ? cadence : 15;
  if (typeof cfg.mission !== 'string') cfg.mission = '';
  if (typeof cfg.timezone !== 'string') cfg.timezone = '';
  if (typeof cfg.parkingLot !== 'string' || !cfg.parkingLot) cfg.parkingLot = DEFAULT_CONFIG.parkingLot;
  return cfg;
}

function sessionsDir() {
  return path.join(home(), 'sessions');
}

function safeId(id) {
  const s = String(id || 'default').replace(/[^A-Za-z0-9._-]/g, '_');
  return s || 'default';
}

function sessionPath(id) {
  return path.join(sessionsDir(), safeId(id) + '.json');
}

function newSession(id, now) {
  return {
    id: safeId(id),
    startedAt: now.toISOString(),
    lastCheckAt: null,
    lastPromptAt: null,
    promptCount: 0,
    toolCalls: 0,
    topicSwitches: 0,
    stillBroken: 0,
    mission: '',
    strictness: '',
    intakeAskedAt: null,
    missionCaptured: false,
    keywords: [],
    trace: [],
    lastLoopTrip: null,
    endedAt: null,
  };
}

function loadSession(id, now) {
  const file = sessionPath(id);
  const fresh = newSession(id, now || new Date());
  const stored = readJson(file, null);
  if (!stored || typeof stored !== 'object') return fresh;
  return Object.assign(fresh, stored, { id: fresh.id });
}

function saveSession(session) {
  writeJson(sessionPath(session.id), session);
}

function latestSession() {
  const dir = sessionsDir();
  let best = null;
  let bestTime = -1;
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    return null;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (err) {
      continue;
    }
    if (stat.mtimeMs > bestTime) {
      bestTime = stat.mtimeMs;
      best = file;
    }
  }
  if (!best) return null;
  const data = readJson(best, null);
  if (!data) return null;
  return Object.assign(newSession(path.basename(best, '.json'), new Date()), data);
}

function logPath() {
  return path.join(home(), 'log.jsonl');
}

function appendLog(entry) {
  ensureDir(home());
  const row = Object.assign({ ts: new Date().toISOString() }, entry);
  fs.appendFileSync(logPath(), JSON.stringify(row) + '\n');
  return row;
}

function readLog() {
  let text = '';
  try {
    text = fs.readFileSync(logPath(), 'utf8');
  } catch (err) {
    return [];
  }
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      // skip damaged lines
    }
  }
  return rows;
}

function resumePath() {
  return path.join(home(), 'resume.md');
}

function lastResumeLine() {
  try {
    const lines = fs.readFileSync(resumePath(), 'utf8').split('\n').filter((l) => l.trim());
    return lines.length ? lines[lines.length - 1] : '';
  } catch (err) {
    return '';
  }
}

// Local wall-clock time, honouring config.timezone when it is valid.
function localClock(cfg, date) {
  const d = date || new Date();
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
  let parts;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', cfg.timezone ? Object.assign({ timeZone: cfg.timezone }, opts) : opts);
    parts = fmt.formatToParts(d);
  } catch (err) {
    parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
  }
  const get = (type) => Number((parts.find((p) => p.type === type) || { value: '0' }).value) % 24;
  const hour = get('hour');
  const minute = get('minute');
  return { hhmm: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'), minutes: hour * 60 + minute };
}

function parseHHMM(text, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

function inQuietHours(cfg, date) {
  const start = parseHHMM(cfg.quietHours.start, 23 * 60);
  const end = parseHHMM(cfg.quietHours.end, 6 * 60);
  const now = localClock(cfg, date).minutes;
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parkingLotPath(cfg, cwd) {
  const p = expandHome(cfg.parkingLot);
  return path.isAbsolute(p) ? p : path.resolve(cwd || process.cwd(), p);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function hashInput(value) {
  return crypto.createHash('sha256').update(stableStringify(value === undefined ? null : value)).digest('hex').slice(0, 16);
}

// Tools an agent uses for most of its ordinary work. Calling one of these many
// times in a row says nothing by itself, so the loop guard never counts them by
// name; it counts how often they hit the same target instead.
const WORKHORSE_TOOLS = new Set([
  'bash', 'read', 'edit', 'write', 'multiedit', 'notebookedit', 'grep', 'glob',
  'ls', 'todowrite', 'task', 'agent', 'webfetch', 'websearch',
]);

function isWorkhorse(tool) {
  return WORKHORSE_TOOLS.has(String(tool || '').toLowerCase());
}

// Shell command reduced to its shape: quoted strings and numbers removed,
// whitespace collapsed, leading "cd <dir> &&" hops dropped, first 60 characters.
// Two retries of one command that differ only in a number, a quoted argument or
// the directory they start from normalise to the same text.
function normaliseCommand(command) {
  let s = String(command == null ? '' : command);
  s = s.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, ' ');
  s = s.replace(/\d+/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:cd [^;&|]*(?:&&|;) ?)+/, '');
  return s.slice(0, 60).trim();
}

function shortText(text, max) {
  const s = String(text);
  return s.length > max ? s.slice(0, max - 3).trimEnd() + '...' : s;
}

function shortPath(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return shortText(parts.slice(-2).join('/') || String(p), 48);
}

// What a workhorse call is aimed at. Returns { key, label } or null when the
// tool has no single target (todo lists, sub-agents) or the input is empty.
// key identifies the target; label is a short form for the advisory and log.
function toolTarget(tool, toolInput) {
  const name = String(tool || '').toLowerCase();
  if (!WORKHORSE_TOOLS.has(name)) return null;
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  if (name === 'bash') {
    const key = normaliseCommand(input.command);
    return key ? { key, label: shortText(key, 48) } : null;
  }
  if (name === 'read' || name === 'edit' || name === 'write' || name === 'multiedit' || name === 'notebookedit') {
    const file = str(input.file_path) || str(input.notebook_path) || str(input.path);
    return file ? { key: file, label: shortPath(file) } : null;
  }
  if (name === 'ls') {
    const dir = str(input.path);
    return dir ? { key: dir, label: shortPath(dir) } : null;
  }
  if (name === 'grep' || name === 'glob') {
    const pattern = str(input.pattern);
    if (!pattern) return null;
    return { key: pattern + ' @ ' + str(input.path), label: shortText(pattern, 48) };
  }
  if (name === 'webfetch') {
    const url = str(input.url);
    return url ? { key: url, label: shortText(url.replace(/[?#].*$/, ''), 48) } : null;
  }
  if (name === 'websearch') {
    const query = str(input.query).toLowerCase().replace(/\s+/g, ' ');
    return query ? { key: query, label: shortText(query, 48) } : null;
  }
  return null;
}

function readStdinJson() {
  let text = '';
  try {
    text = fs.readFileSync(0, 'utf8');
  } catch (err) {
    return {};
  }
  try {
    return JSON.parse(text || '{}');
  } catch (err) {
    return {};
  }
}

function minutesBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function sessionStats(session, rows) {
  const id = session ? session.id : null;
  const mine = rows.filter((r) => !id || r.session === id);
  const byKind = {};
  for (const r of mine) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const checks = mine.filter((r) => r.kind === 'check').length;
  const accepted = mine.filter((r) => (r.kind === 'check' || r.kind === 'check-result') && r.detail && r.detail.result === 'accepted').length;
  const overridden = mine.filter((r) => (r.kind === 'check' || r.kind === 'check-result') && r.detail && r.detail.result === 'overridden').length;
  const loops = mine.filter((r) => String(r.kind).startsWith('loop')).length;
  const parked = mine.filter((r) => r.kind === 'park').length;
  return { byKind, checks, accepted, overridden, loops, parked, total: mine.length };
}

module.exports = {
  DEFAULT_CONFIG,
  STRICTNESS,
  home,
  ensureDir,
  readJson,
  writeJson,
  configPath,
  loadConfig,
  sessionsDir,
  sessionPath,
  safeId,
  newSession,
  loadSession,
  saveSession,
  latestSession,
  logPath,
  appendLog,
  readLog,
  resumePath,
  lastResumeLine,
  localClock,
  inQuietHours,
  parkingLotPath,
  stableStringify,
  hashInput,
  WORKHORSE_TOOLS,
  isWorkhorse,
  normaliseCommand,
  toolTarget,
  readStdinJson,
  minutesBetween,
  sessionStats,
};

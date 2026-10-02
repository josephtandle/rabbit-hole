'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

function startSession(home, id, mission) {
  h.runHook('user-prompt-submit.sh', { session_id: id, prompt: 'begin' }, home);
  h.runHook('user-prompt-submit.sh', { session_id: id, prompt: mission }, home);
}

test('park appends a timestamped line to the parking lot and logs it', () => {
  const home = h.tmpHome();
  startSession(home, 'c1', 'Ship the export feature, mid');
  const res = h.runCli(['park', 'try the new terminal font'], home);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Parked: try the new terminal font/);
  assert.match(res.stdout, /Back to: Ship the export feature/);
  const lot = fs.readFileSync(path.join(home, 'PARKING-LOT.md'), 'utf8');
  assert.match(lot, /^# Parking lot/);
  assert.match(lot, /- \[\d{4}-\d\d-\d\d \d\d:\d\d\] try the new terminal font\n$/);
  h.runCli(['park', 'second idea'], home);
  const lot2 = fs.readFileSync(path.join(home, 'PARKING-LOT.md'), 'utf8');
  assert.equal((lot2.match(/^# Parking lot/gm) || []).length, 1, 'header written once');
  assert.equal(h.readLog(home).filter((r) => r.kind === 'park').length, 2);
});

test('park without text fails with usage', () => {
  const home = h.tmpHome();
  const res = h.runCli(['park'], home);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /usage/);
});

test('mission records outcome and strictness on the latest session', () => {
  const home = h.tmpHome();
  h.runHook('user-prompt-submit.sh', { session_id: 'c2', prompt: 'begin' }, home);
  const res = h.runCli(['mission', 'Launch the pricing page', '--strictness', 'loose'], home);
  assert.equal(res.status, 0, res.stderr);
  const s = h.readSession(home, 'c2');
  assert.equal(s.mission, 'Launch the pricing page');
  assert.equal(s.strictness, 'loose');
  const bad = h.runCli(['mission', 'x', '--strictness', 'harsh'], home);
  assert.equal(bad.status, 1);
});

test('check logs checkpoints and results', () => {
  const home = h.tmpHome();
  startSession(home, 'c3', 'Fix the auth bug, mid');
  assert.equal(h.runCli(['check', 'drift', 'shopping for keyboards'], home).status, 0);
  assert.equal(h.runCli(['check', '--result', 'overridden'], home).status, 0);
  assert.equal(h.runCli(['check', 'looping', 'same test again', '--result', 'accepted'], home).status, 0);
  const rows = h.readLog(home);
  assert.equal(rows.filter((r) => r.kind === 'check').length, 2);
  assert.equal(rows.filter((r) => r.kind === 'check-result').length, 1);
  assert.equal(h.runCli(['check', '--result', 'maybe'], home).status, 1);
});

test('done prints the session summary and writes a resume line', () => {
  const home = h.tmpHome();
  startSession(home, 'c4', 'Ship the export feature, strict');
  const s = h.readSession(home, 'c4');
  s.startedAt = new Date(Date.now() - 75 * 60000).toISOString();
  h.writeSession(home, 'c4', s);
  h.runCli(['park', 'refactor the logger'], home);
  h.runCli(['check', 'drift', 'logger refactor', '--result', 'accepted'], home);
  const res = h.runCli(['done', 'wire the download button'], home);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Outcome: Ship the export feature, strict/);
  assert.match(res.stdout, /Duration: 1 h 15 min/);
  assert.match(res.stdout, /Checks fired: 1 \(accepted 1, overridden 0\)/);
  assert.match(res.stdout, /Parked: 1/);
  const resume = fs.readFileSync(path.join(home, 'resume.md'), 'utf8').trim().split('\n');
  assert.equal(resume.length, 1);
  assert.match(resume[0], /Ship the export feature, strict \| next: wire the download button$/);
  assert.ok(h.readSession(home, 'c4').endedAt);
  const next = h.runHook('user-prompt-submit.sh', { session_id: 'c5', prompt: 'morning' }, home);
  assert.match(next.stdout, /Last resume point: .*wire the download button/);
});

test('done without any session fails cleanly', () => {
  const home = h.tmpHome();
  const res = h.runCli(['done'], home);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /No session recorded/);
});

test('stats and log summarise the ledger', () => {
  const home = h.tmpHome();
  const empty = h.runCli(['stats'], home);
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /0 log entries/);
  startSession(home, 'c6', 'Ship it, mid');
  const call = { session_id: 'c6', tool_name: 'Bash', tool_input: { command: 'make' } };
  for (let i = 0; i < 3; i++) h.runHook('pre-tool-use.sh', call, home);
  h.runCli(['check', 'looping', 'make x3', '--result', 'overridden'], home);
  h.runCli(['park', 'idea'], home);
  const stats = h.runCli(['stats'], home);
  assert.match(stats.stdout, /Checks fired: 1 \(accepted 0, overridden 1/);
  assert.match(stats.stdout, /loop-identical: 1/);
  assert.match(stats.stdout, /park: 1/);
  const log = h.runCli(['log', '--last', '2'], home);
  assert.equal(log.stdout.trim().split('\n').length, 2);
  assert.match(log.stdout, /\[c6\] park/);
});

test('config prints the effective config with defaults and overrides', () => {
  const home = h.tmpHome();
  const def = JSON.parse(h.runCli(['config'], home).stdout);
  assert.equal(def.strictness, 'mid');
  assert.equal(def.cadenceMinutes, 15);
  assert.equal(def.quietHours.start, '23:00');
  assert.equal(def._configFileExists, false);
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ strictness: 'strict', cadenceMinutes: 'oops', quietHours: { start: '22:00' } }));
  const cfg = JSON.parse(h.runCli(['config'], home).stdout);
  assert.equal(cfg.strictness, 'strict');
  assert.equal(cfg.cadenceMinutes, 15, 'invalid cadence falls back');
  assert.equal(cfg.quietHours.start, '22:00');
  assert.equal(cfg.quietHours.end, '06:00');
  assert.equal(cfg._configFileExists, true);
});

test('unknown command prints help and fails', () => {
  const home = h.tmpHome();
  const res = h.runCli(['nope'], home);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /rabbit-hole <command>/);
});

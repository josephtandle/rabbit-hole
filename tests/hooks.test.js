'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

test('first prompt prints the intake instruction and creates session state', () => {
  const home = h.tmpHome();
  const res = h.runHook('user-prompt-submit.sh', { session_id: 'abc', prompt: 'help me ship the login page' }, home);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Intake, first turn only/);
  assert.match(res.stdout, /Rabbit Hole is on/);
  assert.ok(res.stdout.trim().split('\n').length <= 12);
  const s = h.readSession(home, 'abc');
  assert.equal(s.promptCount, 1);
  assert.ok(s.startedAt);
  assert.ok(s.lastCheckAt);
});

test('second prompt inside the cadence prints nothing and captures the mission', () => {
  const home = h.tmpHome();
  h.runHook('user-prompt-submit.sh', { session_id: 's2', prompt: 'help me ship the login page' }, home);
  const res = h.runHook('user-prompt-submit.sh', { session_id: 's2', prompt: 'Done means the login page deploys. Be strict.' }, home);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
  const s = h.readSession(home, 's2');
  assert.equal(s.promptCount, 2);
  assert.equal(s.mission, 'Done means the login page deploys. Be strict.');
  assert.equal(s.strictness, 'strict');
});

test('reminder fires once the cadence has elapsed and includes mission, strictness, local time', () => {
  const home = h.tmpHome();
  h.runHook('user-prompt-submit.sh', { session_id: 's3', prompt: 'start' }, home);
  h.runHook('user-prompt-submit.sh', { session_id: 's3', prompt: 'Ship the invoice export, mid' }, home);
  const s = h.readSession(home, 's3');
  const old = new Date(Date.now() - 20 * 60000).toISOString();
  s.lastCheckAt = old;
  s.startedAt = new Date(Date.now() - 47 * 60000).toISOString();
  h.writeSession(home, 's3', s);
  const res = h.runHook('user-prompt-submit.sh', { session_id: 's3', prompt: 'now add the csv header' }, home);
  assert.match(res.stdout, /Rabbit Hole reminder/);
  assert.match(res.stdout, /Elapsed: 47 min/);
  assert.match(res.stdout, /Local time: \d\d:\d\d \((inside|outside) quiet hours\)/);
  assert.match(res.stdout, /Mission: Ship the invoice export, mid/);
  assert.match(res.stdout, /Strictness: mid/);
  assert.match(res.stdout, /Rabbit Hole check:/);
  assert.ok(res.stdout.trim().split('\n').length <= 12);
  const again = h.runHook('user-prompt-submit.sh', { session_id: 's3', prompt: 'and the footer' }, home);
  assert.equal(again.stdout.trim(), '', 'no second reminder inside the cadence');
});

test('reminder honours cadenceMinutes and quiet hours from config', () => {
  const home = h.tmpHome();
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ cadenceMinutes: 5, quietHours: { start: '00:00', end: '23:59' }, mission: 'Finish the report' }));
  h.runHook('user-prompt-submit.sh', { session_id: 's4', prompt: 'go' }, home);
  const s = h.readSession(home, 's4');
  s.lastCheckAt = new Date(Date.now() - 6 * 60000).toISOString();
  h.writeSession(home, 's4', s);
  const res = h.runHook('user-prompt-submit.sh', { session_id: 's4', prompt: 'next' }, home);
  assert.match(res.stdout, /inside quiet hours/);
  assert.match(res.stdout, /Mission: Finish the report/);
});

test('three still-broken turns trip the still-broken signal once and log it', () => {
  const home = h.tmpHome();
  h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'fix the build' }, home);
  h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'green build, mid' }, home);
  const a = h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'still broken' }, home);
  const b = h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'same error again' }, home);
  const c = h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'that did not work' }, home);
  assert.equal(a.stdout.trim(), '');
  assert.equal(b.stdout.trim(), '');
  assert.match(c.stdout, /still failing/);
  assert.match(c.stdout, /one diagnostic question/);
  const rows = h.readLog(home).filter((r) => r.kind === 'still-broken');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session, 's5');
  const reset = h.runHook('user-prompt-submit.sh', { session_id: 's5', prompt: 'ok that fixed it, thanks' }, home);
  assert.equal(reset.stdout.trim(), '');
  assert.equal(h.readSession(home, 's5').stillBroken, 0);
});

test('topic switches are counted, first three are free, the fourth posts a thread map request', () => {
  const home = h.tmpHome();
  const id = 's6';
  h.runHook('user-prompt-submit.sh', { session_id: id, prompt: 'migrate the postgres schema for billing invoices' }, home);
  h.runHook('user-prompt-submit.sh', { session_id: id, prompt: 'billing invoices migrated and tested, strictness mid' }, home);
  const topics = [
    'compare mechanical keyboard switches linear tactile clicky brands',
    'draft newsletter subject lines about summer sailing holidays',
    'research kubernetes ingress controllers traefik nginx envoy comparison',
    'plan garden irrigation schedule tomatoes peppers drip lines',
  ];
  const outputs = topics.map((p) => h.runHook('user-prompt-submit.sh', { session_id: id, prompt: p }, home).stdout);
  assert.equal(outputs[0].trim(), '');
  assert.equal(outputs[1].trim(), '');
  assert.equal(outputs[2].trim(), '');
  assert.match(outputs[3], /4 topic switches/);
  assert.match(outputs[3], /thread map/);
  assert.equal(h.readSession(home, id).topicSwitches, 4);
  assert.equal(h.readLog(home).filter((r) => r.kind === 'topic-switch').length, 1);
});

test('hook survives malformed stdin and exits 0', () => {
  const home = h.tmpHome();
  const res = h.runHook('user-prompt-submit.sh', 'not json at all', home);
  assert.equal(res.status, 0);
});

test('pre-tool-use trips after three identical calls and logs the trip', () => {
  const home = h.tmpHome();
  const call = { session_id: 'p1', tool_name: 'Bash', tool_input: { command: 'npm test' } };
  const one = h.runHook('pre-tool-use.sh', call, home);
  const two = h.runHook('pre-tool-use.sh', call, home);
  const three = h.runHook('pre-tool-use.sh', call, home);
  assert.equal(one.status, 0);
  assert.equal(one.stdout.trim(), '');
  assert.equal(two.stdout.trim(), '');
  assert.equal(three.status, 0);
  const out = JSON.parse(three.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /loop signal/);
  assert.match(out.hookSpecificOutput.additionalContext, /Bash called 3 times in a row/);
  assert.match(out.hookSpecificOutput.additionalContext, /Re-plan before the next call/);
  assert.equal(three.stdout.trim().split('\n').length, 1);
  const rows = h.readLog(home);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'loop-identical');
  assert.equal(rows[0].session, 'p1');
  assert.ok(rows[0].ts);
  assert.equal(rows[0].detail.tool, 'Bash');
  const s = h.readSession(home, 'p1');
  assert.equal(s.trace.length, 3);
  assert.equal(s.toolCalls, 3);
});

test('pre-tool-use ignores key order in tool_input and stays quiet on varied input below the frequency limit', () => {
  const home = h.tmpHome();
  h.runHook('pre-tool-use.sh', { session_id: 'p2', tool_name: 'Edit', tool_input: { a: 1, b: 2 } }, home);
  h.runHook('pre-tool-use.sh', { session_id: 'p2', tool_name: 'Edit', tool_input: { b: 2, a: 1 } }, home);
  const quiet = h.runHook('pre-tool-use.sh', { session_id: 'p2', tool_name: 'Read', tool_input: { file: 'x' } }, home);
  assert.equal(quiet.stdout.trim(), '');
  const trip = h.runHook('pre-tool-use.sh', { session_id: 'p2', tool_name: 'Edit', tool_input: { a: 1, b: 2 } }, home);
  assert.equal(trip.stdout.trim(), '', 'a Read in between breaks the identical run');
});

test('pre-tool-use stays quiet through ten Bash calls with ten different commands', () => {
  const home = h.tmpHome();
  const commands = [
    'ls -la',
    'git status --short',
    'npm test',
    'cat package.json',
    'grep -rn "TODO" src',
    'node scripts/build.js --out dist',
    'wc -l lib/common.js',
    'git diff --stat',
    'curl -sf http://localhost:3000/health',
    'find . -name "*.md" -maxdepth 2',
  ];
  const outputs = commands.map((command) => h.runHook('pre-tool-use.sh', { session_id: 'q1', tool_name: 'Bash', tool_input: { command } }, home));
  assert.ok(outputs.every((o) => o.status === 0));
  assert.ok(outputs.every((o) => o.stdout.trim() === ''), 'ordinary Bash-heavy work is not a loop');
  assert.equal(h.readLog(home).length, 0);
  assert.equal(h.readSession(home, 'q1').trace.length, 10, 'trace is capped at 10');
});

test('pre-tool-use stays quiet when every Bash command shares a long cd prefix', () => {
  const home = h.tmpHome();
  const prefix = 'cd /srv/checkouts/project-1234/packages/web-frontend-application && ';
  const commands = ['ls -la', 'git status', 'npm test', 'cat README.md', 'node build.js', 'git log -3', 'wc -l index.js', 'npm run lint'];
  const outputs = commands.map((command) => h.runHook('pre-tool-use.sh', { session_id: 'q1b', tool_name: 'Bash', tool_input: { command: prefix + command } }, home).stdout);
  assert.ok(outputs.every((o) => o.trim() === ''), 'the shared cd hop is not the target');
});

test('pre-tool-use stays quiet when Bash and Read alternate with different inputs', () => {
  const home = h.tmpHome();
  const outputs = [];
  for (let i = 0; i < 6; i++) {
    const command = ['ls src', 'git status', 'npm run lint', 'cat notes.txt', 'node check.js', 'git log --oneline'][i];
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q2', tool_name: 'Bash', tool_input: { command } }, home).stdout);
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q2', tool_name: 'Read', tool_input: { file_path: 'src/module-' + 'abcdef'[i] + '.js' } }, home).stdout);
  }
  assert.ok(outputs.every((o) => o.trim() === ''), 'tool names alternating is not an A-B-A-B loop');
  assert.equal(h.readLog(home).length, 0);
});

test('pre-tool-use still trips alternation when the same two calls repeat A-B-A-B-A-B', () => {
  const home = h.tmpHome();
  const a = { session_id: 'q3', tool_name: 'Bash', tool_input: { command: 'npm test' } };
  const b = { session_id: 'q3', tool_name: 'Read', tool_input: { file_path: 'src/app.js' } };
  const outputs = [a, b, a, b, a, b].map((call) => h.runHook('pre-tool-use.sh', call, home).stdout);
  assert.ok(outputs.slice(0, 5).every((o) => o.trim() === ''));
  assert.match(JSON.parse(outputs[5]).hookSpecificOutput.additionalContext, /Bash \/ Read alternating for 3 cycles/);
  assert.deepEqual(h.readLog(home).map((r) => r.kind), ['loop-alternation']);
});

test('pre-tool-use trips loop-churn on five edits of the same file within ten calls', () => {
  const home = h.tmpHome();
  const outputs = [];
  for (let i = 0; i < 5; i++) {
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q4', tool_name: 'Edit', tool_input: { file_path: 'project/src/login.js', old_string: 'a' + i, new_string: 'b' + i } }, home));
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q4', tool_name: 'Bash', tool_input: { command: ['npm test', 'git status', 'ls', 'node run.js', 'git diff'][i] } }, home));
  }
  assert.ok(outputs.every((o) => o.status === 0));
  assert.ok(outputs.slice(0, 8).every((o) => o.stdout.trim() === ''), 'quiet until the fifth edit of the file');
  const out = JSON.parse(outputs[8].stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /Rabbit Hole loop signal: Edit hit the same target 5 times in the last 10 calls \(src\/login\.js\)\. Re-plan before the next call/);
  assert.equal(outputs[8].stdout.trim().split('\n').length, 1);
  assert.equal(outputs[9].stdout.trim(), '');
  const rows = h.readLog(home);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'loop-churn');
  assert.equal(rows[0].session, 'q4');
  assert.ok(rows[0].ts);
  assert.deepEqual(rows[0].detail, { tool: 'Edit', count: 5, window: 10, target: 'src/login.js' });
});

test('pre-tool-use does not count edits spread across different files as churn', () => {
  const home = h.tmpHome();
  const outputs = [];
  for (let i = 0; i < 10; i++) {
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q5', tool_name: 'Edit', tool_input: { file_path: 'src/file-' + 'abcdefghij'[i] + '.js', old_string: 'x', new_string: 'y' } }, home).stdout);
  }
  assert.ok(outputs.every((o) => o.trim() === ''));
});

test('pre-tool-use trips loop-churn on the same normalised Bash command five times with different numbers', () => {
  const home = h.tmpHome();
  const outputs = [];
  for (let i = 0; i < 5; i++) {
    const command = 'sleep ' + (i + 1) * 5 + '  &&  curl -s "http://localhost:' + (3000 + i) + '/health"';
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q6', tool_name: 'Bash', tool_input: { command } }, home).stdout);
  }
  assert.ok(outputs.slice(0, 4).every((o) => o.trim() === ''), 'quiet until the fifth retry');
  const text = JSON.parse(outputs[4]).hookSpecificOutput.additionalContext;
  assert.match(text, /Bash hit the same target 5 times in the last 10 calls \(sleep && curl -s\)/);
  assert.match(text, /what would prove the current approach wrong\?/);
  const again = h.runHook('pre-tool-use.sh', { session_id: 'q6', tool_name: 'Bash', tool_input: { command: 'sleep 99 && curl -s "http://localhost:9/health"' } }, home);
  assert.equal(again.stdout.trim(), '', 'cooldown stops the same kind from repeating on the next call');
  assert.deepEqual(h.readLog(home).map((r) => r.kind), ['loop-churn']);
});

test('pre-tool-use keeps the raw frequency rule for non-workhorse tools such as MCP tools', () => {
  const home = h.tmpHome();
  const outputs = [];
  for (let i = 0; i < 5; i++) {
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q7', tool_name: 'mcp__browser__click', tool_input: { selector: '#item-' + 'abcde'[i] } }, home).stdout);
    outputs.push(h.runHook('pre-tool-use.sh', { session_id: 'q7', tool_name: 'Bash', tool_input: { command: ['ls', 'git status', 'npm test', 'cat notes.md', 'git diff'][i] } }, home).stdout);
  }
  assert.ok(outputs.slice(0, 8).every((o) => o.trim() === ''), 'quiet until the fifth use of the tool');
  assert.match(outputs[8], /loop signal/);
  assert.match(outputs[8], /mcp__browser__click used 5 times in the last 10 calls with varying input/);
  assert.equal(outputs[9].trim(), '', 'cooldown stops the same kind from repeating on the next call');
  const rows = h.readLog(home);
  assert.deepEqual(rows.map((r) => r.kind), ['loop-frequency']);
  assert.deepEqual(rows[0].detail, { tool: 'mcp__browser__click', count: 5, window: 10 });
  assert.equal(h.readSession(home, 'q7').trace.length, 10, 'trace is capped at 10');
});

test('loop guard helpers: command normalisation and workhorse targets', () => {
  const c = require('../lib/common');
  assert.equal(c.normaliseCommand('npm   test -- --seed 42'), c.normaliseCommand('npm test -- --seed 7'));
  assert.equal(c.normaliseCommand('cd /work/app-1 && npm test'), 'npm test');
  assert.equal(c.normaliseCommand('echo "one two" \'three\''), 'echo');
  assert.ok(c.normaliseCommand('x'.repeat(200)).length <= 60);
  assert.equal(c.normaliseCommand(undefined), '');
  assert.ok(c.isWorkhorse('Bash'));
  assert.ok(c.isWorkhorse('WebSearch'));
  assert.ok(!c.isWorkhorse('mcp__browser__click'));
  assert.equal(c.toolTarget('TodoWrite', { todos: [] }), null);
  assert.equal(c.toolTarget('mcp__browser__click', { selector: '#a' }), null);
  assert.equal(c.toolTarget('NotebookEdit', { notebook_path: 'nb/analysis.ipynb' }).key, 'nb/analysis.ipynb');
  const lib = require('../lib/pre-tool-use');
  const legacy = Array.from({ length: 10 }, (_, i) => ({ t: 'Bash', h: 'h' + i }));
  assert.equal(lib.detect(legacy), null, 'a trace written by 2.0.0 (no target hashes) never trips');
});

test('pre-tool-use never exits non-zero on garbage input', () => {
  const home = h.tmpHome();
  const res = h.runHook('pre-tool-use.sh', '{"broken":', home);
  assert.equal(res.status, 0);
});

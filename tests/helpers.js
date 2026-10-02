'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rabbit-hole-test-'));
}

function runHook(name, input, home, extraEnv) {
  const script = path.join(ROOT, 'hooks', 'claude-code', name);
  const res = spawnSync('bash', [script], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: Object.assign({}, process.env, { RABBIT_HOLE_HOME: home }, extraEnv || {}),
    encoding: 'utf8',
  });
  return res;
}

function runCli(args, home, cwd) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'rabbit-hole')].concat(args), {
    env: Object.assign({}, process.env, { RABBIT_HOLE_HOME: home }),
    cwd: cwd || home,
    encoding: 'utf8',
  });
  return res;
}

function readLog(home) {
  try {
    return fs.readFileSync(path.join(home, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    return [];
  }
}

function readSession(home, id) {
  return JSON.parse(fs.readFileSync(path.join(home, 'sessions', id + '.json'), 'utf8'));
}

function writeSession(home, id, data) {
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(home, 'sessions', id + '.json'), JSON.stringify(data, null, 2));
}

module.exports = { ROOT, tmpHome, runHook, runCli, readLog, readSession, writeSession };

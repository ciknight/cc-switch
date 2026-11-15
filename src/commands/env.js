'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { readJson } = require('../config');
const { buildSettings } = require('../merge');
const { getCCSwitchDir } = require('../paths');

function assertInitFiles(configDir) {
  for (const file of ['base.json', 'private.json']) {
    if (!fs.existsSync(path.join(configDir, file))) {
      throw new Error(`${file} not found. Run \`cc-switch init\` first.`);
    }
  }
}

function profilePathOf(configDir, profileName) {
  return path.join(configDir, 'profiles', `${profileName}.json`);
}

function buildEnvSettings(configDir, profileName) {
  assertInitFiles(configDir);
  const profilePath = profilePathOf(configDir, profileName);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`profile "${profileName}" not found`);
  }
  const base = readJson(path.join(configDir, 'base.json'));
  const profile = readJson(profilePath);
  const priv = readJson(path.join(configDir, 'private.json'));
  const merged = buildSettings(base, profile, priv);
  const out = { env: merged.env || {} };
  if ('model' in merged) out.model = merged.model;
  return out;
}

function resolveClaudeBin({ env = process.env, platform = process.platform, spawnSyncFn = spawnSync } = {}) {
  if (env.CC_SWITCH_CLAUDE && env.CC_SWITCH_CLAUDE.trim()) {
    return env.CC_SWITCH_CLAUDE.trim();
  }
  if (platform !== 'win32') return 'claude';
  const result = spawnSyncFn('where.exe', ['claude']);
  const first = result.status === 0 ? String(result.stdout || '').split(/\r?\n/)[0].trim() : '';
  if (!first) {
    throw new Error('claude not found in PATH. Install Claude Code or set CC_SWITCH_CLAUDE to its full path.');
  }
  return first;
}

function quoteCmdArg(arg) {
  if (!/[\s"&|<>^()%]/.test(arg)) return arg;
  let quoted = arg.replace(/"/g, '\\"');
  if (/\\$/.test(quoted)) quoted += '\\';
  return `"${quoted}"`;
}

function buildSpawnInvocation(claudeBin, settingsFile, userArgs, platform = process.platform) {
  const argv = ['--settings', settingsFile, ...userArgs];
  if (platform !== 'win32') {
    return { command: claudeBin, args: argv };
  }
  const cmdLine = [claudeBin, ...argv].map(quoteCmdArg).join(' ');
  return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', cmdLine] };
}

function listProfileNames(configDir) {
  const dir = path.join(configDir, 'profiles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
}

async function launch(profileName, userArgs, opts = {}) {
  const configDir = opts.configDir || getCCSwitchDir();
  const spawnFn = opts.spawnFn || spawn;
  const resolveBin = opts.resolveBin || resolveClaudeBin;
  assertInitFiles(configDir);
  if (!fs.existsSync(profilePathOf(configDir, profileName))) {
    throw new Error(
      `profile "${profileName}" not found. Available profiles: ${listProfileNames(configDir).join(', ') || '(none)'}`);
  }
  const settings = buildEnvSettings(configDir, profileName);
  // Resolve the binary and build the invocation BEFORE writing the token-bearing
  // temp file: if resolution fails there is nothing to leak.
  const claudeBin = opts.claudeBin || resolveBin();
  const settingsFile = path.join(os.tmpdir(), `cc-switch-env-${process.pid}-${crypto.randomUUID().slice(0, 8)}.json`);
  const cleanup = () => { try { fs.unlinkSync(settingsFile); } catch (_) { /* already gone */ } };
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    if (process.platform !== 'win32') fs.chmodSync(settingsFile, 0o600);
    const modelSuffix = settings.model ? `, model: ${settings.model}` : '';
    console.error(`[cc-switch] session profile "${profileName}"${modelSuffix}`);
    const { command, args } = buildSpawnInvocation(claudeBin, settingsFile, userArgs);
    return await new Promise((resolve, reject) => {
      const onSignal = () => { /* let the child handle the signal; cleanup runs on close */ };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      process.on('exit', cleanup);
      const detach = () => {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        process.off('exit', cleanup);
      };
      const child = spawnFn(command, args, { stdio: 'inherit' });
      child.on('close', (code) => { detach(); cleanup(); resolve(code); });
      child.on('error', (err) => {
        detach(); cleanup();
        if (err && err.code === 'ENOENT') {
          reject(new Error(`claude not found at "${command}". Check PATH or set CC_SWITCH_CLAUDE.`));
        } else {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

function run(profileName, userArgs, options = {}) {
  const configDir = options.configDir || getCCSwitchDir();
  if (options.print) {
    try {
      assertInitFiles(configDir);
      if (!fs.existsSync(profilePathOf(configDir, profileName))) {
        throw new Error(
          `profile "${profileName}" not found. Available profiles: ${listProfileNames(configDir).join(', ') || '(none)'}`);
      }
      console.log(JSON.stringify(buildEnvSettings(configDir, profileName), null, 2));
      return Promise.resolve();
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
  // commander keeps a leading '--' in variadic args; strip it so claude never sees it
  const passthrough = userArgs[0] === '--' ? userArgs.slice(1) : userArgs;
  return launch(profileName, passthrough, {
    configDir,
    claudeBin: options.claudeBin,
    spawnFn: options.spawnFn,
  })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { buildEnvSettings, resolveClaudeBin, quoteCmdArg, buildSpawnInvocation, launch, run };

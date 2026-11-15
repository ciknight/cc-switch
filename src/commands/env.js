'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJson } = require('../config');
const { buildSettings } = require('../merge');

function buildEnvSettings(configDir, profileName) {
  for (const file of ['base.json', 'private.json']) {
    if (!fs.existsSync(path.join(configDir, file))) {
      throw new Error(`${file} not found. Run \`cc-switch init\` first.`);
    }
  }
  const profilePath = path.join(configDir, 'profiles', `${profileName}.json`);
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

module.exports = { buildEnvSettings, resolveClaudeBin, quoteCmdArg, buildSpawnInvocation };

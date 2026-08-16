'use strict';
const fs = require('fs');
const { getClaudeSettingsPath, getLocalClaudeSettingsPath } = require('../paths');
const { readState } = require('../config');

function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.slice(0, 7) + '***' + token.slice(-4);
}

function resolveEffectiveView(localPath, globalPath, state = {}) {
  const sourcePath = fs.existsSync(localPath) ? localPath
    : fs.existsSync(globalPath) ? globalPath
    : null;
  if (!sourcePath) return null;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${sourcePath}: ${err.message}`);
  }
  const scope = sourcePath === localPath ? 'local' : 'global';
  const env = settings.env || {};
  const profileName = settings._ccSwitchProfile
    || (scope === 'global' && state.activeProfile)
    || '(unknown)';
  return {
    scope,
    sourcePath,
    profileName,
    model: settings.model,
    anthropicModel: env.ANTHROPIC_MODEL,
    baseUrl: env.ANTHROPIC_BASE_URL,
    authToken: env.ANTHROPIC_AUTH_TOKEN,
  };
}

function formatStatus(view) {
  const lines = [
    `Source         : ${view.sourcePath} (${view.scope})`,
    `Active profile : ${view.profileName}`,
    `Model (top)    : ${view.model || 'not set'}`,
  ];
  if (view.anthropicModel) {
    lines.push(`ANTHROPIC_MODEL: ${view.anthropicModel}`);
  }
  lines.push(`BASE_URL       : ${view.baseUrl || 'not set'}`);
  lines.push(`AUTH_TOKEN     : ${view.authToken ? maskToken(view.authToken) : 'not set'}`);
  return lines;
}

function run() {
  const state = readState();
  let view;
  try {
    view = resolveEffectiveView(
      getLocalClaudeSettingsPath(process.cwd()),
      getClaudeSettingsPath(),
      state
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!view) {
    console.log('No active settings found. Run `cc-switch use <profile>` or `cc-switch local <profile>` to activate one.');
    return;
  }
  formatStatus(view).forEach(l => console.log(l));
}

module.exports = { formatStatus, maskToken, resolveEffectiveView, run };

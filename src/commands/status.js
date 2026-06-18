'use strict';
const fs = require('fs');
const path = require('path');
const { getCCSwitchDir, getClaudeSettingsPath } = require('../paths');
const { readState } = require('../config');

function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.slice(0, 7) + '***' + token.slice(-4);
}

function formatStatus(profileName, profile, priv, settingsPath) {
  const lines = [
    `Active profile : ${profileName}`,
    `Target         : ${settingsPath}`,
    `Model (top)    : ${profile.model || 'not set'}`,
  ];
  if (profile.env && profile.env.ANTHROPIC_MODEL) {
    lines.push(`ANTHROPIC_MODEL: ${profile.env.ANTHROPIC_MODEL}`);
  }
  lines.push(`BASE_URL       : ${priv.ANTHROPIC_BASE_URL} (from private)`);
  lines.push(`AUTH_TOKEN     : ${maskToken(priv.ANTHROPIC_AUTH_TOKEN)} (masked)`);
  return lines;
}

function run() {
  const configDir = getCCSwitchDir();
  const state = readState();
  if (!state.activeProfile) {
    console.log('No active profile. Run `cc-switch use <profile>` to activate one.');
    return;
  }
  const profilePath = path.join(configDir, 'profiles', `${state.activeProfile}.json`);
  if (!fs.existsSync(profilePath)) {
    console.error(`Active profile "${state.activeProfile}" no longer exists.`);
    process.exit(1);
  }
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const privPath = path.join(configDir, 'private.json');
  if (!fs.existsSync(privPath)) {
    console.error('private.json not found. Run `cc-switch init` first.');
    process.exit(1);
  }
  const priv = JSON.parse(fs.readFileSync(privPath, 'utf8'));
  formatStatus(state.activeProfile, profile, priv, getClaudeSettingsPath()).forEach(l => console.log(l));
}

module.exports = { formatStatus, maskToken, run };

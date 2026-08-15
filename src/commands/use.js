'use strict';
const fs = require('fs');
const path = require('path');
const { getCCSwitchDir, getClaudeSettingsPath, getLocalClaudeSettingsPath } = require('../paths');
const { readJson, writeJson } = require('../config');
const { buildSettings } = require('../merge');

function applyProfile(profileName, settingsPath, configDir, { recordState = true } = {}) {
  const base = readJson(path.join(configDir, 'base.json'));
  const profile = readJson(path.join(configDir, 'profiles', `${profileName}.json`));
  const priv = readJson(path.join(configDir, 'private.json'));
  const settings = buildSettings(base, profile, priv);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJson(settingsPath, settings);
  if (recordState) {
    writeJson(path.join(configDir, 'state.json'), { activeProfile: profileName });
  }
}

function run(profileName, options) {
  const configDir = getCCSwitchDir();
  const profilePath = path.join(configDir, 'profiles', `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    const { listProfiles } = require('../config');
    console.error(`Error: profile "${profileName}" not found.`);
    console.error('Available profiles:', listProfiles().join(', '));
    process.exit(1);
  }
  const settingsPath = options.local
    ? getLocalClaudeSettingsPath(process.cwd())
    : getClaudeSettingsPath();
  applyProfile(profileName, settingsPath, configDir, { recordState: !options.local });
  const label = options.local ? '(local)' : '(global)';
  console.log(`Switched to profile "${profileName}" ${label}`);
  console.log(`Written to: ${settingsPath}`);
}

module.exports = { applyProfile, run };

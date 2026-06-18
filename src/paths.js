'use strict';
const os = require('os');
const path = require('path');

function getCCSwitchDir() {
  return path.join(os.homedir(), '.cc-switch');
}

function getProfilesDir() {
  return path.join(getCCSwitchDir(), 'profiles');
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function getLocalClaudeSettingsPath(cwd) {
  return path.join(cwd, '.claude', 'settings.json');
}

module.exports = { getCCSwitchDir, getProfilesDir, getClaudeSettingsPath, getLocalClaudeSettingsPath };

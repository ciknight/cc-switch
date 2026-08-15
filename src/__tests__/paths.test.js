'use strict';
const os = require('os');
const path = require('path');
const { getCCSwitchDir, getProfilesDir, getClaudeSettingsPath, getLocalClaudeSettingsPath } = require('../paths');

test('getCCSwitchDir returns .cc-switch in home dir', () => {
  expect(getCCSwitchDir()).toBe(path.join(os.homedir(), '.cc-switch'));
});

test('getProfilesDir returns profiles subdir of cc-switch dir', () => {
  expect(getProfilesDir()).toBe(path.join(os.homedir(), '.cc-switch', 'profiles'));
});

test('getClaudeSettingsPath returns global claude settings.json', () => {
  expect(getClaudeSettingsPath()).toBe(path.join(os.homedir(), '.claude', 'settings.json'));
});

test('getLocalClaudeSettingsPath returns .claude/settings.local.json under given dir', () => {
  expect(getLocalClaudeSettingsPath('/project')).toBe(path.join('/project', '.claude', 'settings.local.json'));
});

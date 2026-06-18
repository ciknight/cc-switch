'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Redirect getCCSwitchDir to a temp dir for isolation
jest.mock('../paths', () => {
  const path = require('path');
  return {
    getCCSwitchDir: () => global.__testCCSwitchDir,
    getProfilesDir: () => path.join(global.__testCCSwitchDir, 'profiles'),
    getClaudeSettingsPath: () => path.join(global.__testCCSwitchDir, '.claude', 'settings.json'),
    getLocalClaudeSettingsPath: (cwd) => path.join(cwd, '.claude', 'settings.json'),
  };
});

const { readJson, writeJson, readState, writeState, readManifest, listProfiles, profileExists, isBuiltIn } = require('../config');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-cfg-'));
  global.__testCCSwitchDir = tmpDir;
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('writeJson and readJson round-trip', () => {
  const filePath = path.join(tmpDir, 'test.json');
  writeJson(filePath, { a: 1, b: 'hello' });
  expect(readJson(filePath)).toEqual({ a: 1, b: 'hello' });
});

test('readState returns empty object when state.json missing', () => {
  expect(readState()).toEqual({});
});

test('writeState then readState round-trips', () => {
  writeState({ activeProfile: 'glm' });
  expect(readState()).toEqual({ activeProfile: 'glm' });
});

test('listProfiles returns empty array when profiles dir missing', () => {
  expect(listProfiles()).toEqual([]);
});

test('listProfiles returns profile names without extension', () => {
  const profilesDir = path.join(tmpDir, 'profiles');
  fs.mkdirSync(profilesDir);
  fs.writeFileSync(path.join(profilesDir, 'sonnet.json'), '{}');
  fs.writeFileSync(path.join(profilesDir, 'glm.json'), '{}');
  expect(listProfiles().sort()).toEqual(['glm', 'sonnet']);
});

test('profileExists returns false for missing profile', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'));
  expect(profileExists('missing')).toBe(false);
});

test('profileExists returns true for existing profile', () => {
  const profilesDir = path.join(tmpDir, 'profiles');
  fs.mkdirSync(profilesDir);
  fs.writeFileSync(path.join(profilesDir, 'sonnet.json'), '{}');
  expect(profileExists('sonnet')).toBe(true);
});

test('isBuiltIn returns true for name in manifest', () => {
  writeJson(path.join(tmpDir, 'profiles.manifest.json'), ['sonnet', 'glm', 'opus']);
  expect(isBuiltIn('sonnet')).toBe(true);
  expect(isBuiltIn('custom')).toBe(false);
});

test('readManifest returns empty array when missing', () => {
  expect(readManifest()).toEqual([]);
});

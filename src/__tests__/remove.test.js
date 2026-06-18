'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeProfile } = require('../commands/remove');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-rm-'));
  fs.mkdirSync(path.join(tmpDir, 'profiles'));
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'custom.json'), '{"model":"sonnet"}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'sonnet.json'), '{"model":"sonnet"}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'profiles.manifest.json'), JSON.stringify(['sonnet']), 'utf8');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('removeProfile deletes a custom profile file', () => {
  removeProfile('custom', path.join(tmpDir, 'profiles'), path.join(tmpDir, 'profiles.manifest.json'));
  expect(fs.existsSync(path.join(tmpDir, 'profiles', 'custom.json'))).toBe(false);
});

test('removeProfile throws when removing a built-in profile', () => {
  expect(() =>
    removeProfile('sonnet', path.join(tmpDir, 'profiles'), path.join(tmpDir, 'profiles.manifest.json'))
  ).toThrow(/built-in/);
});

test('removeProfile throws when profile does not exist', () => {
  expect(() =>
    removeProfile('missing', path.join(tmpDir, 'profiles'), path.join(tmpDir, 'profiles.manifest.json'))
  ).toThrow(/not found/);
});

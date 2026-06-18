'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupConfig } = require('../commands/init');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-init-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('setupConfig creates private.json with given values', () => {
  setupConfig('sk-test-token', 'https://api.test.com', tmpDir);
  const priv = JSON.parse(fs.readFileSync(path.join(tmpDir, 'private.json'), 'utf8'));
  expect(priv.ANTHROPIC_AUTH_TOKEN).toBe('sk-test-token');
  expect(priv.ANTHROPIC_BASE_URL).toBe('https://api.test.com');
});

test('setupConfig creates base.json with permissions and plugins', () => {
  setupConfig('sk-test', 'https://api.test', tmpDir);
  const base = JSON.parse(fs.readFileSync(path.join(tmpDir, 'base.json'), 'utf8'));
  expect(base.permissions).toBeDefined();
  expect(base.enabledPlugins).toBeDefined();
  expect(base.language).toBe('Chinese');
});

test('setupConfig copies all three preset profiles', () => {
  setupConfig('sk-test', 'https://api.test', tmpDir);
  const profilesDir = path.join(tmpDir, 'profiles');
  expect(fs.existsSync(path.join(profilesDir, 'sonnet.json'))).toBe(true);
  expect(fs.existsSync(path.join(profilesDir, 'glm.json'))).toBe(true);
  expect(fs.existsSync(path.join(profilesDir, 'opus.json'))).toBe(true);
});

test('setupConfig writes profiles.manifest.json listing built-in names', () => {
  setupConfig('sk-test', 'https://api.test', tmpDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles.manifest.json'), 'utf8'));
  expect(manifest).toContain('sonnet');
  expect(manifest).toContain('glm');
  expect(manifest).toContain('opus');
});

test('setupConfig sets private.json to mode 600 on unix', () => {
  if (process.platform === 'win32') return;
  setupConfig('sk-test', 'https://api.test', tmpDir);
  const stat = fs.statSync(path.join(tmpDir, 'private.json'));
  expect(stat.mode & 0o777).toBe(0o600);
});

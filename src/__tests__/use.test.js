'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyProfile } = require('../commands/use');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-use-'));
  const ccDir = path.join(tmpDir, 'cc');
  fs.mkdirSync(path.join(ccDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(ccDir, 'private.json'), JSON.stringify({
    ANTHROPIC_AUTH_TOKEN: 'sk-test',
    ANTHROPIC_BASE_URL: 'https://api.test',
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'base.json'), JSON.stringify({
    env: { CLAUDE_CODE_ATTRIBUTION_HEADER: '0' },
    permissions: { allow: [] },
    language: 'Chinese',
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'profiles', 'sonnet.json'), JSON.stringify({ model: 'sonnet' }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'profiles', 'glm.json'), JSON.stringify({
    model: 'sonnet',
    env: { ANTHROPIC_MODEL: 'glm-5.1' },
  }), 'utf8');
  fs.writeFileSync(path.join(ccDir, 'state.json'), JSON.stringify({}), 'utf8');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('applyProfile writes merged settings.json', () => {
  const settingsPath = path.join(tmpDir, 'settings.json');
  const ccDir = path.join(tmpDir, 'cc');
  applyProfile('sonnet', settingsPath, ccDir);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  expect(settings.model).toBe('sonnet');
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://api.test');
  expect(settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe('0');
});

test('applyProfile glm sets model env vars', () => {
  const settingsPath = path.join(tmpDir, 'settings.json');
  applyProfile('glm', settingsPath, path.join(tmpDir, 'cc'));
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  expect(settings.env.ANTHROPIC_MODEL).toBe('glm-5.1');
  expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
});

test('applyProfile creates target directory if missing', () => {
  const settingsPath = path.join(tmpDir, 'nested', 'dir', 'settings.json');
  applyProfile('sonnet', settingsPath, path.join(tmpDir, 'cc'));
  expect(fs.existsSync(settingsPath)).toBe(true);
});

test('applyProfile updates state.json with active profile name', () => {
  applyProfile('glm', path.join(tmpDir, 'settings.json'), path.join(tmpDir, 'cc'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'cc', 'state.json'), 'utf8'));
  expect(state.activeProfile).toBe('glm');
});

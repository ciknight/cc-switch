'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatStatus, maskToken, resolveEffectiveView } = require('../commands/status');

let tmpDir;
let localPath;
let globalPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-status-'));
  localPath = path.join(tmpDir, 'settings.local.json');
  globalPath = path.join(tmpDir, 'settings.json');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeSettings(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

test('maskToken keeps first 7 chars and last 4, hides middle', () => {
  expect(maskToken('sk-ant-abc123xyz')).toBe('sk-ant-***3xyz');
});

test('maskToken returns *** for short tokens', () => {
  expect(maskToken('short')).toBe('***');
});

test('resolveEffectiveView prefers local settings when present', () => {
  writeSettings(localPath, { model: 'sonnet', _ccSwitchProfile: 'glm', env: { ANTHROPIC_BASE_URL: 'https://local.test' } });
  writeSettings(globalPath, { model: 'opus', _ccSwitchProfile: 'opus', env: { ANTHROPIC_BASE_URL: 'https://global.test' } });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.scope).toBe('local');
  expect(view.sourcePath).toBe(localPath);
  expect(view.baseUrl).toBe('https://local.test');
});

test('resolveEffectiveView falls back to global when local missing', () => {
  writeSettings(globalPath, { model: 'opus', _ccSwitchProfile: 'sonnet' });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.scope).toBe('global');
  expect(view.sourcePath).toBe(globalPath);
});

test('resolveEffectiveView returns null when neither file exists', () => {
  expect(resolveEffectiveView(localPath, globalPath, {})).toBeNull();
});

test('resolveEffectiveView falls back to state activeProfile for global files without metadata', () => {
  writeSettings(globalPath, { model: 'opus' });
  const view = resolveEffectiveView(localPath, globalPath, { activeProfile: 'glm' });
  expect(view.profileName).toBe('glm');
});

test('resolveEffectiveView shows (unknown) for local files without metadata', () => {
  writeSettings(localPath, { model: 'sonnet' });
  const view = resolveEffectiveView(localPath, globalPath, { activeProfile: 'glm' });
  expect(view.profileName).toBe('(unknown)');
});

test('resolveEffectiveView extracts model and env values from the effective file', () => {
  writeSettings(globalPath, {
    model: 'sonnet',
    _ccSwitchProfile: 'glm',
    env: {
      ANTHROPIC_MODEL: 'glm-5.1',
      ANTHROPIC_BASE_URL: 'https://api.test',
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-abc123xyz',
    },
  });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.profileName).toBe('glm');
  expect(view.model).toBe('sonnet');
  expect(view.anthropicModel).toBe('glm-5.1');
  expect(view.baseUrl).toBe('https://api.test');
  expect(view.authToken).toBe('sk-ant-abc123xyz');
});

test('resolveEffectiveView returns undefined for missing env keys', () => {
  writeSettings(globalPath, { model: 'opus' });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.anthropicModel).toBeUndefined();
  expect(view.baseUrl).toBeUndefined();
  expect(view.authToken).toBeUndefined();
});

test('resolveEffectiveView throws on corrupt JSON', () => {
  fs.writeFileSync(localPath, '{not json', 'utf8');
  expect(() => resolveEffectiveView(localPath, globalPath, {})).toThrow(/Failed to parse/);
});

test('resolveEffectiveView throws on non-object JSON', () => {
  writeSettings(localPath, null);
  expect(() => resolveEffectiveView(localPath, globalPath, {})).toThrow(/not a JSON object/);
});

test('formatStatus renders view lines with masked token', () => {
  const view = {
    scope: 'local',
    sourcePath: './.claude/settings.local.json',
    profileName: 'glm',
    model: 'sonnet',
    anthropicModel: 'glm-5.1',
    baseUrl: 'https://proxy.test',
    authToken: 'sk-ant-abc123xyz',
  };
  const text = formatStatus(view).join('\n');
  expect(text).toContain('Source         : ./.claude/settings.local.json (local)');
  expect(text).toContain('Active profile : glm');
  expect(text).toContain('Model (top)    : sonnet');
  expect(text).toContain('ANTHROPIC_MODEL: glm-5.1');
  expect(text).toContain('BASE_URL       : https://proxy.test');
  expect(text).toContain('AUTH_TOKEN     : sk-ant-***3xyz');
  expect(text).not.toContain('sk-ant-abc123xyz');
});

test('formatStatus omits ANTHROPIC_MODEL line when absent', () => {
  const view = {
    scope: 'global',
    sourcePath: '~/.claude/settings.json',
    profileName: 'sonnet',
    model: 'sonnet',
    anthropicModel: undefined,
    baseUrl: 'https://api.test',
    authToken: 'sk-ant-abc123xyz',
  };
  expect(formatStatus(view).join('\n')).not.toContain('ANTHROPIC_MODEL');
});

test('formatStatus shows not set for missing model, baseUrl and authToken', () => {
  const view = {
    scope: 'global',
    sourcePath: '~/.claude/settings.json',
    profileName: 'sonnet',
    model: undefined,
    anthropicModel: undefined,
    baseUrl: undefined,
    authToken: undefined,
  };
  const text = formatStatus(view).join('\n');
  expect(text).toContain('Model (top)    : not set');
  expect(text).toContain('BASE_URL       : not set');
  expect(text).toContain('AUTH_TOKEN     : not set');
});

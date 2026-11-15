'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpDir;
let ccDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-env-'));
  ccDir = path.join(tmpDir, 'cc');
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
  fs.writeFileSync(path.join(ccDir, 'profiles', 'bare.json'), JSON.stringify({
    env: { ANTHROPIC_MODEL: 'bare-model' },
  }), 'utf8');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('buildEnvSettings returns merged env plus model only', () => {
  const { buildEnvSettings } = require('../commands/env');
  const out = buildEnvSettings(ccDir, 'glm');
  expect(out.env.ANTHROPIC_MODEL).toBe('glm-5.1');
  expect(out.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  expect(out.env.ANTHROPIC_BASE_URL).toBe('https://api.test');
  expect(out.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe('0'); // base.json 的 env key 保留
  expect(out.model).toBe('sonnet');
  expect(Object.keys(out).sort()).toEqual(['env', 'model']); // 不含 permissions/language 等
});

test('buildEnvSettings omits model key when profile has none', () => {
  const { buildEnvSettings } = require('../commands/env');
  const out = buildEnvSettings(ccDir, 'bare');
  expect(out.env.ANTHROPIC_MODEL).toBe('bare-model');
  expect('model' in out).toBe(false);
  expect(Object.keys(out)).toEqual(['env']);
});

test('buildEnvSettings throws for missing profile', () => {
  const { buildEnvSettings } = require('../commands/env');
  expect(() => buildEnvSettings(ccDir, 'nope')).toThrow('not found');
});

test('buildEnvSettings throws init hint when base.json missing', () => {
  const { buildEnvSettings } = require('../commands/env');
  fs.rmSync(path.join(ccDir, 'base.json'));
  expect(() => buildEnvSettings(ccDir, 'glm')).toThrow('cc-switch init');
});

test('buildEnvSettings throws init hint when private.json missing', () => {
  const { buildEnvSettings } = require('../commands/env');
  fs.rmSync(path.join(ccDir, 'private.json'));
  expect(() => buildEnvSettings(ccDir, 'glm')).toThrow('cc-switch init');
});

'use strict';
const { deepMerge, buildSettings } = require('../merge');

test('deepMerge combines disjoint objects', () => {
  expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
});

test('deepMerge override value wins', () => {
  expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
});

test('deepMerge merges nested env objects key-by-key', () => {
  const base = { env: { FOO: 'base', BAR: 'base' } };
  const override = { env: { FOO: 'new' } };
  expect(deepMerge(base, override)).toEqual({ env: { FOO: 'new', BAR: 'base' } });
});

test('deepMerge does not mutate inputs', () => {
  const base = { a: 1 };
  const override = { b: 2 };
  deepMerge(base, override);
  expect(base).toEqual({ a: 1 });
});

test('buildSettings merges base + profile and injects private values', () => {
  const base = { env: { ATTR: '0' }, permissions: { allow: [] } };
  const profile = { model: 'opus', env: { ANTHROPIC_MODEL: 'opus-x' } };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-test', ANTHROPIC_BASE_URL: 'https://api.test' };
  const result = buildSettings(base, profile, priv);
  expect(result.model).toBe('opus');
  expect(result.env.ANTHROPIC_MODEL).toBe('opus-x');
  expect(result.env.ATTR).toBe('0');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://api.test');
  expect(result.permissions).toEqual({ allow: [] });
});

test('buildSettings injects private into env even when profile has no env', () => {
  const base = { env: { ATTR: '0' } };
  const profile = { model: 'sonnet' };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-x', ANTHROPIC_BASE_URL: 'https://x' };
  const result = buildSettings(base, profile, priv);
  expect(result.env.ATTR).toBe('0');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-x');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://x');
});

test('buildSettings keeps profile ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL when present', () => {
  const base = { env: { ATTR: '0' } };
  const profile = {
    model: 'custom',
    env: {
      ANTHROPIC_AUTH_TOKEN: 'profile-token',
      ANTHROPIC_BASE_URL: 'https://profile.api',
    },
  };
  const priv = {
    ANTHROPIC_AUTH_TOKEN: 'private-token',
    ANTHROPIC_BASE_URL: 'https://private.api',
  };
  const result = buildSettings(base, profile, priv);
  expect(result.model).toBe('custom');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('profile-token');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://profile.api');
  expect(result.env.ATTR).toBe('0');
});

test('buildSettings falls back to private values when profile omits tokens', () => {
  const base = { env: { ATTR: '0' } };
  const profile = { model: 'sonnet' };
  const priv = {
    ANTHROPIC_AUTH_TOKEN: 'private-token',
    ANTHROPIC_BASE_URL: 'https://private.api',
  };
  const result = buildSettings(base, profile, priv);
  expect(result.model).toBe('sonnet');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('private-token');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://private.api');
  expect(result.env.ATTR).toBe('0');
});

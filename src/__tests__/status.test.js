'use strict';
const { formatStatus, maskToken } = require('../commands/status');

test('maskToken keeps first 7 chars and last 4, hides middle', () => {
  expect(maskToken('sk-ant-abc123xyz')).toBe('sk-ant-***3xyz');
});

test('maskToken returns *** for short tokens', () => {
  expect(maskToken('short')).toBe('***');
});

test('formatStatus shows profile name and BASE_URL', () => {
  const profile = { model: 'sonnet' };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-ant-abc123xyz', ANTHROPIC_BASE_URL: 'https://api.test' };
  const lines = formatStatus('sonnet', profile, priv, '~/.claude/settings.json');
  expect(lines.join('\n')).toContain('sonnet');
  expect(lines.join('\n')).toContain('https://api.test');
});

test('formatStatus masks AUTH_TOKEN', () => {
  const profile = { model: 'sonnet' };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-ant-abc123xyz', ANTHROPIC_BASE_URL: 'https://api.test' };
  const lines = formatStatus('sonnet', profile, priv, '~/.claude/settings.json');
  const tokenLine = lines.find(l => l.includes('AUTH_TOKEN'));
  expect(tokenLine).not.toContain('sk-ant-abc123xyz');
  expect(tokenLine).toContain('***');
});

test('formatStatus shows ANTHROPIC_MODEL when in profile env', () => {
  const profile = { model: 'sonnet', env: { ANTHROPIC_MODEL: 'glm-5.1' } };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-x', ANTHROPIC_BASE_URL: 'https://api.test' };
  const lines = formatStatus('glm', profile, priv, '~/.claude/settings.json');
  expect(lines.join('\n')).toContain('glm-5.1');
});

test('formatStatus omits ANTHROPIC_MODEL line when not in profile', () => {
  const profile = { model: 'sonnet' };
  const priv = { ANTHROPIC_AUTH_TOKEN: 'sk-x', ANTHROPIC_BASE_URL: 'https://api.test' };
  const lines = formatStatus('sonnet', profile, priv, '~/.claude/settings.json');
  expect(lines.join('\n')).not.toContain('ANTHROPIC_MODEL');
});

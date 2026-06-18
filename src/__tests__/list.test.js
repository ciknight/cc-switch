'use strict';
const { formatProfileList } = require('../commands/list');

test('formatProfileList marks active profile with asterisk', () => {
  const lines = formatProfileList(['sonnet', 'glm', 'opus'], ['sonnet', 'glm', 'opus'], 'glm');
  expect(lines.find(l => l.includes('glm'))).toMatch(/^\*/);
  expect(lines.find(l => l.includes('sonnet'))).toMatch(/^ /);
});

test('formatProfileList marks built-in vs custom', () => {
  const lines = formatProfileList(['sonnet', 'custom'], ['sonnet'], null);
  expect(lines.find(l => l.includes('sonnet'))).toContain('(built-in)');
  expect(lines.find(l => l.includes('custom'))).toContain('(custom)');
});

test('formatProfileList returns empty array when no profiles', () => {
  expect(formatProfileList([], [], null)).toEqual([]);
});

test('formatProfileList uses space prefix when no active profile', () => {
  const lines = formatProfileList(['sonnet'], ['sonnet'], null);
  expect(lines[0]).toMatch(/^ /);
});

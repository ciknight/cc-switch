'use strict';
const { resolveEditor } = require('../commands/edit');

test('resolveEditor uses VISUAL when set', () => {
  expect(resolveEditor({ VISUAL: 'vim', EDITOR: 'nano' }, 'linux')).toBe('vim');
});

test('resolveEditor falls back to EDITOR when VISUAL unset', () => {
  expect(resolveEditor({ EDITOR: 'nano' }, 'linux')).toBe('nano');
});

test('resolveEditor returns notepad on win32 when no env vars', () => {
  expect(resolveEditor({}, 'win32')).toBe('notepad');
});

test('resolveEditor returns nano on linux when no env vars', () => {
  expect(resolveEditor({}, 'linux')).toBe('nano');
});

test('resolveEditor returns nano on darwin when no env vars', () => {
  expect(resolveEditor({}, 'darwin')).toBe('nano');
});

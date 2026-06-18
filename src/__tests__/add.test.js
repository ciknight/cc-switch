'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createProfileStub } = require('../commands/add');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-add-'));
  fs.mkdirSync(path.join(tmpDir, 'profiles'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('createProfileStub writes a valid JSON file', () => {
  const filePath = createProfileStub('my-model', path.join(tmpDir, 'profiles'));
  expect(fs.existsSync(filePath)).toBe(true);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(parsed.model).toBeDefined();
});

test('createProfileStub throws if profile already exists', () => {
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'existing.json'), '{}');
  expect(() => createProfileStub('existing', path.join(tmpDir, 'profiles'))).toThrow(/already exists/);
});

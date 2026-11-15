'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BUNDLED_PROFILES_DIR, getBundledProfiles, syncProfiles } = require('../sync-profiles');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-sync-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('getBundledProfiles lists repo profiles without extension', () => {
  const names = getBundledProfiles();
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length); // unique
  for (const name of names) {
    expect(name).not.toMatch(/\.json$/);
    expect(fs.existsSync(path.join(BUNDLED_PROFILES_DIR, `${name}.json`))).toBe(true);
  }
});

test('syncProfiles creates target dir and copies all bundled profiles + manifest', () => {
  const target = path.join(tmpDir, 'fresh');
  const bundled = getBundledProfiles();
  const synced = syncProfiles(target);
  expect(synced).toEqual(bundled);
  for (const name of bundled) {
    expect(fs.readFileSync(path.join(target, 'profiles', `${name}.json`), 'utf8'))
      .toBe(fs.readFileSync(path.join(BUNDLED_PROFILES_DIR, `${name}.json`), 'utf8'));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'profiles.manifest.json'), 'utf8'));
  expect(manifest).toEqual(bundled);
});

test('syncProfiles overwrites stale built-in profiles with bundled versions', () => {
  const probe = getBundledProfiles()[0];
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profiles', `${probe}.json`), '{"outdated":true}', 'utf8');
  syncProfiles(tmpDir);
  const synced = JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles', `${probe}.json`), 'utf8'));
  expect(synced).toEqual(JSON.parse(fs.readFileSync(path.join(BUNDLED_PROFILES_DIR, `${probe}.json`), 'utf8')));
});

test('syncProfiles preserves custom profiles not in the manifest', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  const custom = { model: 'my-model', env: { ANTHROPIC_MODEL: 'my-model' } };
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'custom.json'), JSON.stringify(custom), 'utf8');
  syncProfiles(tmpDir);
  expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles', 'custom.json'), 'utf8'))).toEqual(custom);
});

test('syncProfiles removes managed profiles that are no longer bundled', () => {
  const kept = getBundledProfiles()[0];
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'retired.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'profiles.manifest.json'), JSON.stringify(['retired', kept]), 'utf8');
  syncProfiles(tmpDir);
  expect(fs.existsSync(path.join(tmpDir, 'profiles', 'retired.json'))).toBe(false);
  expect(fs.existsSync(path.join(tmpDir, 'profiles', `${kept}.json`))).toBe(true);
});

test('syncProfiles heals a corrupt manifest and still syncs', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profiles.manifest.json'), '{not json', 'utf8');
  const bundled = syncProfiles(tmpDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles.manifest.json'), 'utf8'));
  expect(manifest).toEqual(bundled);
  for (const name of bundled) {
    expect(fs.existsSync(path.join(tmpDir, 'profiles', `${name}.json`))).toBe(true);
  }
});

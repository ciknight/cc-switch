'use strict';
const fs = require('fs');
const path = require('path');

const BUNDLED_PROFILES_DIR = path.join(__dirname, '..', 'profiles');

function getBundledProfiles() {
  return fs.readdirSync(BUNDLED_PROFILES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));
}

function readManifest(targetDir) {
  const p = path.join(targetDir, 'profiles.manifest.json');
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return []; // corrupt manifest: skip stale-deletion, manifest gets rewritten below
  }
}

function syncProfiles(targetDir) {
  const profilesDir = path.join(targetDir, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });

  const bundled = getBundledProfiles();

  // Remove managed profiles that are no longer bundled (renamed/dropped upstream).
  for (const name of readManifest(targetDir)) {
    if (!bundled.includes(name)) {
      const stale = path.join(profilesDir, `${name}.json`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
  }

  // Built-in profiles are managed by cc-switch: always overwrite with the bundled copy.
  for (const name of bundled) {
    fs.copyFileSync(
      path.join(BUNDLED_PROFILES_DIR, `${name}.json`),
      path.join(profilesDir, `${name}.json`)
    );
  }

  fs.writeFileSync(
    path.join(targetDir, 'profiles.manifest.json'),
    JSON.stringify(bundled, null, 2) + '\n',
    'utf8'
  );
  return bundled;
}

module.exports = { BUNDLED_PROFILES_DIR, getBundledProfiles, syncProfiles };

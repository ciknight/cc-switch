'use strict';
const fs = require('fs');
const path = require('path');
const { getCCSwitchDir, getProfilesDir } = require('../paths');

function removeProfile(name, profilesDir, manifestPath) {
  const filePath = path.join(profilesDir, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.includes(name)) {
    throw new Error(`Cannot remove built-in profile "${name}".`);
  }
  fs.unlinkSync(filePath);
}

function run(name) {
  const configDir = getCCSwitchDir();
  try {
    removeProfile(name, getProfilesDir(), path.join(configDir, 'profiles.manifest.json'));
    console.log(`Removed profile "${name}".`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { removeProfile, run };

'use strict';
const fs = require('fs');
const path = require('path');
const { getCCSwitchDir, getProfilesDir } = require('../paths');
const { openEditor } = require('./edit');

function createProfileStub(name, profilesDir) {
  const filePath = path.join(profilesDir, `${name}.json`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" already exists. Use \`cc-switch edit ${name}\` to edit it.`);
  }
  fs.writeFileSync(filePath, JSON.stringify({ model: 'sonnet' }, null, 2) + '\n', 'utf8');
  return filePath;
}

function run(name) {
  const profilesDir = getProfilesDir();
  if (!fs.existsSync(profilesDir)) {
    console.error('Profiles directory not found. Run `cc-switch init` first.');
    process.exit(1);
  }
  let filePath;
  try {
    filePath = createProfileStub(name, profilesDir);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(`Created profile stub: ${filePath}`);
  openEditor(filePath);
}

module.exports = { createProfileStub, run };

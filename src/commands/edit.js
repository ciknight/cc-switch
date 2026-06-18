'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getCCSwitchDir, getProfilesDir } = require('../paths');

function resolveEditor(env, platform) {
  if (env.VISUAL) return env.VISUAL;
  if (env.EDITOR) return env.EDITOR;
  return platform === 'win32' ? 'notepad' : 'nano';
}

function openEditor(filePath) {
  const editor = resolveEditor(process.env, process.platform);
  const result = spawnSync(editor, [filePath], { stdio: 'inherit' });
  if (result.error) {
    console.log(`Could not open editor "${editor}".`);
    console.log(`Edit the file manually: ${filePath}`);
  }
}

function run(profileName, options) {
  const configDir = getCCSwitchDir();
  let targetPath;

  if (options.base) {
    targetPath = path.join(configDir, 'base.json');
  } else if (options.private) {
    targetPath = path.join(configDir, 'private.json');
  } else if (profileName) {
    targetPath = path.join(getProfilesDir(), `${profileName}.json`);
  } else {
    console.error('Specify a profile name, --base, or --private.');
    process.exit(1);
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`File not found: ${targetPath}`);
    if (!options.base && !options.private) {
      const { listProfiles } = require('../config');
      console.error('Available profiles:', listProfiles().join(', '));
    }
    process.exit(1);
  }

  openEditor(targetPath);
}

module.exports = { resolveEditor, openEditor, run };

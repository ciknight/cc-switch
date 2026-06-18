'use strict';
const fs = require('fs');
const path = require('path');
const { getCCSwitchDir, getProfilesDir } = require('./paths');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readState() {
  const p = path.join(getCCSwitchDir(), 'state.json');
  if (!fs.existsSync(p)) return {};
  return readJson(p);
}

function writeState(data) {
  writeJson(path.join(getCCSwitchDir(), 'state.json'), data);
}

function readManifest() {
  const p = path.join(getCCSwitchDir(), 'profiles.manifest.json');
  if (!fs.existsSync(p)) return [];
  return readJson(p);
}

function listProfiles() {
  const dir = getProfilesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''));
}

function profileExists(name) {
  return fs.existsSync(path.join(getProfilesDir(), `${name}.json`));
}

function isBuiltIn(name) {
  return readManifest().includes(name);
}

function readPrivate() {
  const p = path.join(getCCSwitchDir(), 'private.json');
  if (!fs.existsSync(p)) {
    console.error('Error: private.json not found. Run `cc-switch init` first.');
    process.exit(1);
  }
  return readJson(p);
}

function readBase() {
  const p = path.join(getCCSwitchDir(), 'base.json');
  if (!fs.existsSync(p)) {
    console.error('Error: base.json not found. Run `cc-switch init` first.');
    process.exit(1);
  }
  return readJson(p);
}

function readProfile(name) {
  const p = path.join(getProfilesDir(), `${name}.json`);
  if (!fs.existsSync(p)) {
    console.error(`Error: profile "${name}" not found. Run \`cc-switch list\` to see available profiles.`);
    process.exit(1);
  }
  return readJson(p);
}

module.exports = {
  readJson, writeJson,
  readState, writeState,
  readManifest,
  listProfiles, profileExists, isBuiltIn,
  readPrivate, readBase, readProfile,
};

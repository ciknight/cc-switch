'use strict';
const fs = require('fs');
const path = require('path');
const { readJson } = require('../config');
const { buildSettings } = require('../merge');

function buildEnvSettings(configDir, profileName) {
  for (const file of ['base.json', 'private.json']) {
    if (!fs.existsSync(path.join(configDir, file))) {
      throw new Error(`${file} not found. Run \`cc-switch init\` first.`);
    }
  }
  const profilePath = path.join(configDir, 'profiles', `${profileName}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`profile "${profileName}" not found`);
  }
  const base = readJson(path.join(configDir, 'base.json'));
  const profile = readJson(profilePath);
  const priv = readJson(path.join(configDir, 'private.json'));
  const merged = buildSettings(base, profile, priv);
  const out = { env: merged.env || {} };
  if ('model' in merged) out.model = merged.model;
  return out;
}

module.exports = { buildEnvSettings };

'use strict';
const { listProfiles, readState, readManifest } = require('../config');

function formatProfileList(profiles, builtIns, activeProfile) {
  return profiles.map(name => {
    const prefix = name === activeProfile ? '*' : ' ';
    const tag = builtIns.includes(name) ? '(built-in)' : '(custom)';
    const arrow = name === activeProfile ? '  ← active' : '';
    return `${prefix} ${name.padEnd(12)} ${tag}${arrow}`;
  });
}

function run() {
  const profiles = listProfiles();
  if (profiles.length === 0) {
    console.log('No profiles found. Run `cc-switch init` first.');
    return;
  }
  const { activeProfile } = readState();
  const builtIns = readManifest();
  formatProfileList(profiles, builtIns, activeProfile).forEach(l => console.log(l));
}

module.exports = { formatProfileList, run };

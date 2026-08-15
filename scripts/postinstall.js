#!/usr/bin/env node
'use strict';
/**
 * postinstall hook: sync bundled profiles into ~/.cc-switch.
 * Runs on `yarn install` / `npm install` / `npm install -g .` / `npm link`.
 * Never fails the install — errors are reported as warnings only.
 */
try {
  const { syncProfiles } = require('../src/sync-profiles');
  const { getCCSwitchDir } = require('../src/paths');
  const dir = getCCSwitchDir();
  const synced = syncProfiles(dir);
  console.log(`cc-switch: synced ${synced.length} built-in profiles to ${dir}`);
} catch (err) {
  console.warn(`cc-switch: profile sync failed (${err.message}). Run \`cc-switch init\` to set up manually.`);
}

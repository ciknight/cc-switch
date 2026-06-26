#!/usr/bin/env node
'use strict';
/**
 * Removes the global `cc-switch` command.
 * ~/.cc-switch (profiles, private.json, base.json) is left untouched on purpose.
 *
 * Driven by `make uninstall` or `npm run teardown`.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: IS_WIN,
  });
  return res.status === 0;
}

console.log('\x1b[36m▶ Removing global `cc-switch`\x1b[0m');
const ok = run('npm', ['uninstall', '-g', 'cc-switch']);
// Also drop a dev link if one exists (harmless if not).
run('npm', ['unlink', 'cc-switch']);

if (ok) {
  console.log('\x1b[32m✔ Global command removed.\x1b[0m');
  console.log('  Config in ~/.cc-switch was kept. Delete it manually if you want a full cleanup.');
} else {
  console.error('\x1b[31m✖ Uninstall failed. Try: sudo npm uninstall -g cc-switch\x1b[0m');
  process.exit(1);
}

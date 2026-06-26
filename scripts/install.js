#!/usr/bin/env node
'use strict';
/**
 * Cross-platform installer for cc-switch.
 *
 * Steps:
 *   1. Install local dependencies (npm install)
 *   2. Register the `cc-switch` command globally (npm install -g .)
 *   3. Run `cc-switch init` to write ~/.cc-switch config (interactive)
 *
 * Driven by `make install` (macOS/Linux) or `npm run setup` (any OS incl. Windows).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const SHELL = IS_WIN; // resolve npm.cmd on Windows

function banner(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

/** Run a command inheriting stdio. Returns true on success. */
function run(cmd, args, { cwd = ROOT } = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd, shell: SHELL });
  return res.status === 0;
}

function main() {
  banner('Installing dependencies');
  if (!run('npm', ['install'])) {
    fail('npm install failed. Check your network / package manager.');
  }

  banner('Registering global command `cc-switch`');
  if (!run('npm', ['install', '-g', '.'])) {
    console.error(
      '\x1b[33m! Global install was rejected — usually a permissions issue.\x1b[0m\n' +
        '  Retry with elevated rights, for example:\n' +
        '    macOS/Linux:  sudo npm install -g .\n' +
        '    Windows:      open an elevated terminal and re-run, or use: npm link'
    );
    // Fall back to `npm link` (no copy; live link to this checkout).
    console.log('\n  Trying `npm link` as a fallback...');
    if (!run('npm', ['link'])) {
      fail('Could not register cc-switch globally. See messages above.');
    }
  }

  banner('Verifying installation');
  const cli = path.join(ROOT, 'bin', 'cli.js');
  const verify = spawnSync('node', [cli, '--version'], { cwd: ROOT, encoding: 'utf8' });
  if (verify.status !== 0) {
    fail('cc-switch did not run after install.');
  }
  console.log(`cc-switch ${verify.stdout.trim()} OK`);

  banner('Initializing configuration');
  console.log('You will be asked for ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL.');
  // Run via the local CLI so it works even before the global bin is on PATH.
  const ok = run('node', [cli, 'init']);
  if (!ok) {
    fail('`cc-switch init` did not complete. Re-run with: make install (or npm run setup).');
  }

  console.log('\n\x1b[32m✔ Done. `cc-switch` is installed and configured.\x1b[0m');
  console.log('  Activate a profile with:  cc-switch use sonnet');
  console.log('  See status with:          cc-switch status\n');
}

main();

'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getCCSwitchDir } = require('../paths');
const { syncProfiles } = require('../sync-profiles');

const BUNDLED_BASE = path.join(__dirname, '..', 'templates', 'base.json');

function setupConfig(token, baseUrl, targetDir) {
  try {
    fs.mkdirSync(path.join(targetDir, 'profiles'), { recursive: true });

    const privatePath = path.join(targetDir, 'private.json');
    fs.writeFileSync(privatePath, JSON.stringify({
      ANTHROPIC_AUTH_TOKEN: token,
      ANTHROPIC_BASE_URL: baseUrl,
    }, null, 2) + '\n', 'utf8');
    if (process.platform !== 'win32') {
      fs.chmodSync(privatePath, 0o600);
    }

    fs.copyFileSync(BUNDLED_BASE, path.join(targetDir, 'base.json'));

    syncProfiles(targetDir);
  } catch (err) {
    console.error(`Failed to initialize cc-switch: ${err.message}`);
    process.exit(1);
  }
}

async function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function run() {
  const targetDir = getCCSwitchDir();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (fs.existsSync(path.join(targetDir, 'private.json'))) {
    const answer = await prompt(rl, 'cc-switch is already initialized. Reinitialize? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      rl.close();
      console.log('Aborted.');
      return;
    }
  }

  const token = await prompt(rl, 'ANTHROPIC_AUTH_TOKEN: ');
  const baseUrl = await prompt(rl, 'ANTHROPIC_BASE_URL (default: https://api.anthropic.com): ');
  rl.close();

  setupConfig(token, baseUrl || 'https://api.anthropic.com', targetDir);
  console.log(`\nInitialized cc-switch in ${targetDir}`);
  console.log('Run `cc-switch use sonnet` to activate the sonnet profile.');
}

module.exports = { setupConfig, run };

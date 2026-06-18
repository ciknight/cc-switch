#!/usr/bin/env node
'use strict';
const { Command } = require('commander');
const program = new Command();

program
  .name('cc-switch')
  .description('Claude Code model profile switcher')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize: store AUTH_TOKEN and BASE_URL, copy preset profiles')
  .action(() => require('../src/commands/init').run());

program
  .command('use <profile>')
  .description('Activate a profile (writes ~/.claude/settings.json by default)')
  .option('--local', 'Write to ./.claude/settings.json instead of global')
  .action((profile, options) => require('../src/commands/use').run(profile, options));

program
  .command('list')
  .description('List all available profiles')
  .action(() => require('../src/commands/list').run());

program
  .command('status')
  .description('Show active profile and key settings (TOKEN masked)')
  .action(() => require('../src/commands/status').run());

program
  .command('add <name>')
  .description('Create a new custom profile and open it in an editor')
  .action((name) => require('../src/commands/add').run(name));

program
  .command('edit [profile]')
  .description('Edit a profile, base.json (--base), or private.json (--private)')
  .option('--base', 'Edit base.json')
  .option('--private', 'Edit private.json (TOKEN and URL)')
  .action((profile, options) => require('../src/commands/edit').run(profile, options));

program
  .command('remove <profile>')
  .description('Delete a custom profile (built-in profiles are protected)')
  .action((name) => require('../src/commands/remove').run(name));

program.parse();

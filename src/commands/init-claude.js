'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { quoteCmdArg, resolveClaudeBin } = require('./env');

const BUNDLED_TEMPLATE = path.join(__dirname, '..', 'templates', 'claude-md', 'CLAUDE.template.md');
const BUNDLED_PROMPT = path.join(__dirname, '..', 'templates', 'claude-md', 'init-prompt.md');
const PROMPT_RELATIVE_PATH = path.join('.claude', 'cc-switch-init-claude.md');
const INITIAL_MESSAGE = '请读取 .claude/cc-switch-init-claude.md 并按其说明执行。';
const DOC_DIRS = ['spec', 'plan', 'guide', 'reference'];

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match);
}

function assertProjectDir(projectDir) {
  let stat;
  try {
    stat = fs.statSync(projectDir);
  } catch (_) {
    throw new Error(`project directory not found: ${projectDir}`);
  }
  if (!stat.isDirectory()) throw new Error(`not a directory: ${projectDir}`);
}

function scaffoldDocs(projectDir) {
  for (const name of DOC_DIRS) {
    const dir = path.join(projectDir, 'docs', name);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '', 'utf8');
  }
}

function prepareTarget({ projectDir, force = false, templatePath = BUNDLED_TEMPLATE, now = new Date() }) {
  if (!fs.existsSync(templatePath)) throw new Error(`template not found: ${templatePath}`);
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
  let backupPath = null;
  if (fs.existsSync(claudeMdPath)) {
    if (!force) {
      throw new Error('CLAUDE.md already exists. Re-run with --force to overwrite (a backup will be created).');
    }
    backupPath = path.join(projectDir, 'CLAUDE.md.bak');
    fs.copyFileSync(claudeMdPath, backupPath);
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const rendered = renderTemplate(template, {
    PROJECT_NAME: path.basename(projectDir),
    DATE: formatDate(now),
  });
  fs.writeFileSync(claudeMdPath, rendered, 'utf8');
  return { claudeMdPath, backupPath };
}

function buildClaudeInvocation(claudeBin, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform !== 'win32') return { command: claudeBin, args };
  const cmdLine = 'chcp 65001>nul & ' + [claudeBin, ...args].map(quoteCmdArg).join(' ');
  return { command: comspec || 'cmd.exe', args: ['/d', '/s', '/c', cmdLine] };
}

async function launch({
  projectDir,
  spawnFn = spawn,
  resolveBin = resolveClaudeBin,
  platform = process.platform,
  comspec = process.env.ComSpec,
  initialMessage = INITIAL_MESSAGE,
  promptTemplatePath = BUNDLED_PROMPT,
  now = new Date(),
} = {}) {
  assertProjectDir(projectDir);
  const claudeBin = resolveBin();
  const promptPath = path.join(projectDir, PROMPT_RELATIVE_PATH);
  const promptTemplate = fs.readFileSync(promptTemplatePath, 'utf8');
  const prompt = renderTemplate(promptTemplate, {
    PROJECT_NAME: path.basename(projectDir),
    DATE: formatDate(now),
  });
  const { command, args } = buildClaudeInvocation(claudeBin, [initialMessage], platform, comspec);
  const cleanup = () => { try { fs.unlinkSync(promptPath); } catch (_) { /* already gone */ } };

  try {
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });
    fs.writeFileSync(promptPath, prompt, 'utf8');
  } catch (err) {
    cleanup();
    throw err;
  }

  return new Promise((resolve, reject) => {
    // First Ctrl+C belongs to the child (it shares the console). A second one
    // means the user wants out regardless: clean up and exit.
    let interrupted = false;
    const onSignal = () => {
      if (interrupted) { detach(); cleanup(); process.exit(130); }
      interrupted = true;
    };
    const detach = () => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('exit', cleanup);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('exit', cleanup);

    let child;
    try {
      child = spawnFn(command, args, { cwd: projectDir, stdio: 'inherit' });
    } catch (err) {
      detach();
      cleanup();
      reject(err);
      return;
    }

    child.on('close', (code) => { detach(); cleanup(); resolve(code == null ? 1 : code); });
    child.on('error', (err) => {
      detach();
      cleanup();
      if (err && err.code === 'ENOENT') {
        reject(new Error(`claude not found at "${command}". Check PATH or set CC_SWITCH_CLAUDE.`));
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

module.exports = {
  BUNDLED_TEMPLATE,
  BUNDLED_PROMPT,
  PROMPT_RELATIVE_PATH,
  INITIAL_MESSAGE,
  DOC_DIRS,
  formatDate,
  renderTemplate,
  assertProjectDir,
  scaffoldDocs,
  prepareTarget,
  buildClaudeInvocation,
  launch,
};
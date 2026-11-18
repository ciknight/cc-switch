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
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`project directory not found: ${projectDir}`);
    }
    throw new Error(`cannot access project directory ${projectDir}: ${err.code || err.message}`);
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

function backupStamp(date) {
  const ymd = formatDate(date).replace(/-/g, '');
  const hms = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join('');
  return `${ymd}-${hms}`;
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
    if (fs.existsSync(backupPath)) {
      const base = `CLAUDE.md.bak.${backupStamp(now)}`;
      backupPath = path.join(projectDir, base);
      let suffix = 1;
      while (fs.existsSync(backupPath)) {
        backupPath = path.join(projectDir, `${base}-${suffix}`);
        suffix += 1;
      }
    }
    fs.copyFileSync(claudeMdPath, backupPath);
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const rendered = renderTemplate(template, {
    PROJECT_NAME: path.basename(projectDir),
    DATE: formatDate(now),
  });
  const tmpPath = `${claudeMdPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, rendered, 'utf8');
    fs.renameSync(tmpPath, claudeMdPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* already gone */ }
    throw err;
  }
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
  if (platform === 'win32' && path.isAbsolute(claudeBin) && !fs.existsSync(claudeBin)) {
    throw new Error(`claude not found at "${claudeBin}". Check PATH or set CC_SWITCH_CLAUDE.`);
  }
  const promptPath = path.join(projectDir, PROMPT_RELATIVE_PATH);
  const promptTemplate = fs.readFileSync(promptTemplatePath, 'utf8');
  const prompt = renderTemplate(promptTemplate, {
    PROJECT_NAME: path.basename(projectDir),
    DATE: formatDate(now),
  });
  const { command, args } = buildClaudeInvocation(claudeBin, [initialMessage], platform, comspec);
  const cleanup = () => { try { fs.unlinkSync(promptPath); } catch (_) { /* already gone */ } };

  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  try {
    fs.writeFileSync(promptPath, prompt, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw new Error(`temporary prompt already exists: ${promptPath}. Remove it and retry.`);
    }
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
      child = spawnFn(command, args, {
        cwd: projectDir,
        stdio: 'inherit',
        windowsVerbatimArguments: platform === 'win32',
      });
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

async function run(dir, options = {}) {
  const projectDir = path.resolve(dir || process.cwd());
  const setExitCode = options.setExitCode || ((code) => { process.exitCode = code; });

  try {
    assertProjectDir(projectDir);
    const { claudeMdPath, backupPath } = prepareTarget({
      projectDir,
      force: Boolean(options.force),
      templatePath: options.template || BUNDLED_TEMPLATE,
    });
    scaffoldDocs(projectDir);

    if (backupPath) console.log(`Backed up existing CLAUDE.md to ${backupPath}`);
    console.log(`CLAUDE.md skeleton written to ${claudeMdPath}`);

    if (options.launch === false) {
      console.log(`Skipped launching claude (--no-launch). To run the interview later: cc-switch init-claude "${projectDir}" --force`);
      return;
    }

    const code = await launch({
      projectDir,
      spawnFn: options.spawnFn,
      resolveBin: options.resolveBin,
    });
    if (code !== 0) setExitCode(code);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    setExitCode(1);
  }
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
  run,
};
'use strict';
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'claude-md', 'CLAUDE.template.md');
const PROMPT_PATH = path.join(__dirname, '..', 'templates', 'claude-md', 'init-prompt.md');

describe('bundled init-claude assets', () => {
  test('CLAUDE template has the nine required sections in order', () => {
    const text = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const headings = Array.from(text.matchAll(/^## (\d+)\. (.+)$/gm), m => `${m[1]}. ${m[2].trim()}`);
    expect(headings).toHaveLength(9);
    expect(headings[0]).toBe('1. 项目信息');
    expect(headings[8]).toBe('9. 变更记录');
    for (const keyword of ['DDD', 'RESTful', 'MCP', 'docs/spec/', 'GitHub Flow', '第三方', '{{PROJECT_NAME}}']) {
      expect(text).toContain(keyword);
    }
  });

  test('init prompt covers the required interview topics', () => {
    const text = fs.readFileSync(PROMPT_PATH, 'utf8');
    for (const keyword of ['这个项目是做什么的', 'DDD', 'RESTful', 'MCP', 'docs/spec', 'GitHub Flow', '第三方', 'CLAUDE.md', 'AskUserQuestion']) {
      expect(text).toContain(keyword);
    }
  });
});

const os = require('os');
const {
  formatDate,
  renderTemplate,
  scaffoldDocs,
  prepareTarget,
  assertProjectDir,
} = require('../commands/init-claude');

describe('init-claude preparation helpers', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-init-claude-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('formatDate uses local YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 10, 18))).toBe('2026-11-18');
  });

  test('assertProjectDir rejects a missing path and a file', () => {
    expect(() => assertProjectDir(path.join(tmpDir, 'nope'))).toThrow('project directory not found');
    const filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, '');
    expect(() => assertProjectDir(filePath)).toThrow('not a directory');
  });

  test('renderTemplate replaces known placeholders and preserves unknown ones', () => {
    expect(renderTemplate('{{PROJECT_NAME}}|{{DATE}}|{{UNKNOWN}}', { PROJECT_NAME: 'demo', DATE: '2026-11-18' }))
      .toBe('demo|2026-11-18|{{UNKNOWN}}');
  });

  test('scaffoldDocs creates the four docs directories with .gitkeep, idempotently', () => {
    scaffoldDocs(tmpDir);
    scaffoldDocs(tmpDir);
    for (const name of ['spec', 'plan', 'guide', 'reference']) {
      expect(fs.existsSync(path.join(tmpDir, 'docs', name, '.gitkeep'))).toBe(true);
    }
  });

  test('prepareTarget renders the template into CLAUDE.md', () => {
    const templatePath = path.join(tmpDir, 'custom.md');
    fs.writeFileSync(templatePath, '# {{PROJECT_NAME}}\n{{DATE}}\n');
    const { claudeMdPath, backupPath } = prepareTarget({
      projectDir: tmpDir,
      templatePath,
      now: new Date(2026, 10, 18),
    });
    expect(backupPath).toBeNull();
    expect(fs.readFileSync(claudeMdPath, 'utf8')).toBe(`# ${path.basename(tmpDir)}\n2026-11-18\n`);
  });

  test('prepareTarget refuses to overwrite an existing CLAUDE.md without force', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'old');
    expect(() => prepareTarget({ projectDir: tmpDir })).toThrow('--force');
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toBe('old');
  });

  test('prepareTarget backs up and overwrites with force', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'old');
    const { backupPath } = prepareTarget({ projectDir: tmpDir, force: true, now: new Date(2026, 10, 18) });
    expect(fs.readFileSync(backupPath, 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toContain('项目信息');
  });

  test('prepareTarget reports a missing custom template', () => {
    expect(() => prepareTarget({ projectDir: tmpDir, templatePath: path.join(tmpDir, 'nope.md') }))
      .toThrow('template not found');
  });
});

const { EventEmitter } = require('events');
const {
  buildClaudeInvocation,
  launch,
  INITIAL_MESSAGE,
  PROMPT_RELATIVE_PATH,
} = require('../commands/init-claude');

function fakeSpawn(onSpawn) {
  return jest.fn((command, args, options) => {
    const child = new EventEmitter();
    if (onSpawn) onSpawn({ command, args, options, child });
    process.nextTick(() => child.emit('close', 0));
    return child;
  });
}

describe('init-claude launch', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-init-claude-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('INITIAL_MESSAGE is the Chinese prompt-file instruction', () => {
    expect(INITIAL_MESSAGE).toBe('请读取 .claude/cc-switch-init-claude.md 并按其说明执行。');
  });

  test('buildClaudeInvocation on POSIX passes the binary and args through', () => {
    expect(buildClaudeInvocation('claude', ['你好'], 'linux')).toEqual({
      command: 'claude',
      args: ['你好'],
    });
  });

  test('buildClaudeInvocation on Windows uses cmd, chcp 65001, and quotes the message', () => {
    const invocation = buildClaudeInvocation('C:\\npm\\claude.cmd', ['请读取 文件'], 'win32', 'cmd.exe');
    expect(invocation.command).toBe('cmd.exe');
    expect(invocation.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(invocation.args[3]).toContain('chcp 65001>nul');
    expect(invocation.args[3]).toContain('C:\\npm\\claude.cmd');
    expect(invocation.args[3]).toContain('"请读取 文件"');
  });

  test('launch writes a prompt, spawns claude in the project directory, and cleans up', async () => {
    const promptPath = path.join(tmpDir, PROMPT_RELATIVE_PATH);
    let promptExistedAtSpawn = false;
    const spawnFn = fakeSpawn(() => { promptExistedAtSpawn = fs.existsSync(promptPath); });

    const code = await launch({
      projectDir: tmpDir,
      spawnFn,
      resolveBin: () => 'claude',
      platform: 'linux',
      now: new Date(2026, 10, 18),
    });

    expect(code).toBe(0);
    expect(promptExistedAtSpawn).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnFn.mock.calls[0];
    expect(command).toBe('claude');
    expect(args).toEqual([INITIAL_MESSAGE]);
    expect(options.cwd).toBe(tmpDir);
    expect(options.stdio).toBe('inherit');
    expect(fs.existsSync(promptPath)).toBe(false);
  });

  test('launch works when the project path contains spaces', async () => {
    const spacedDir = path.join(tmpDir, 'my project');
    fs.mkdirSync(spacedDir);
    const spawnFn = fakeSpawn();
    await expect(launch({
      projectDir: spacedDir,
      spawnFn,
      resolveBin: () => 'claude',
      platform: 'linux',
    })).resolves.toBe(0);
    expect(spawnFn.mock.calls[0][2].cwd).toBe(spacedDir);
  });

  test('launch does not write a prompt when claude cannot be resolved', async () => {
    const promptPath = path.join(tmpDir, PROMPT_RELATIVE_PATH);
    await expect(launch({
      projectDir: tmpDir,
      spawnFn: jest.fn(),
      resolveBin: () => { throw new Error('claude not found'); },
      platform: 'linux',
    })).rejects.toThrow('claude not found');
    expect(fs.existsSync(promptPath)).toBe(false);
  });

  test('launch removes the prompt when spawn fails', async () => {
    const promptPath = path.join(tmpDir, PROMPT_RELATIVE_PATH);
    const spawnFn = jest.fn(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return child;
    });

    await expect(launch({
      projectDir: tmpDir,
      spawnFn,
      resolveBin: () => 'claude',
      platform: 'linux',
    })).rejects.toThrow('claude not found at');
    expect(fs.existsSync(promptPath)).toBe(false);
  });
});
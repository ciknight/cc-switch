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
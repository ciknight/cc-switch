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
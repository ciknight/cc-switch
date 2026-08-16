# cc-switch status 读取实际生效配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cc-switch status` 优先读取项目本地 `./.claude/settings.local.json`（不存在则回退 `~/.claude/settings.json`），且 model / `BASE_URL` / `AUTH_TOKEN` 全部取自实际生效文件，正确反映自定义 profile 对 token/baseURL 的覆盖。

**Architecture:** `applyProfile` 写 settings 时附加 `_ccSwitchProfile` 元数据字段（全局与 local 都写，`state.json` 保留作 global 回退）。`status` 新增 `resolveEffectiveView(localPath, globalPath, state)` 解析函数（local 优先 → global 回退，从文件提取 profile 名与 env 值），`formatStatus(view)` 按新签名渲染，`run()` 只做路径解析与 IO 编排。`merge.js` 与模板不动。

**Tech Stack:** Node.js >= 18 (CommonJS), commander CLI, jest 测试（临时目录 + 真实文件 IO）。

**Spec:** `docs/superpowers/specs/2026-08-16-status-effective-config-design.md`

---

### Task 1: `applyProfile` 写入 `_ccSwitchProfile` 元数据

**Files:**
- Modify: `src/commands/use.js:8-18`（`applyProfile` 函数体）
- Test: `src/__tests__/use.test.js`（文件末尾追加两个用例）

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/use.test.js` 文件末尾（`applyProfile with recordState:false leaves state.json untouched` 用例之后）追加：

```js
test('applyProfile records profile name in settings metadata', () => {
  const settingsPath = path.join(tmpDir, 'settings.json');
  applyProfile('glm', settingsPath, path.join(tmpDir, 'cc'));
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  expect(settings._ccSwitchProfile).toBe('glm');
});

test('applyProfile records profile name for local targets too', () => {
  const settingsPath = path.join(tmpDir, 'settings.local.json');
  applyProfile('glm', settingsPath, path.join(tmpDir, 'cc'), { recordState: false });
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  expect(settings._ccSwitchProfile).toBe('glm');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/__tests__/use.test.js`
Expected: FAIL — 两个新用例报 `Expected: "glm" / Received: undefined`（`_ccSwitchProfile` 尚未写入）；原有 5 个用例 PASS。

- [ ] **Step 3: 最小实现**

修改 `src/commands/use.js` 的 `applyProfile`，在 `buildSettings` 之后、`mkdirSync` 之前插入一行：

```js
function applyProfile(profileName, settingsPath, configDir, { recordState = true } = {}) {
  const base = readJson(path.join(configDir, 'base.json'));
  const profile = readJson(path.join(configDir, 'profiles', `${profileName}.json`));
  const priv = readJson(path.join(configDir, 'private.json'));
  const settings = buildSettings(base, profile, priv);
  settings._ccSwitchProfile = profileName;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJson(settingsPath, settings);
  if (recordState) {
    writeJson(path.join(configDir, 'state.json'), { activeProfile: profileName });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest src/__tests__/use.test.js`
Expected: PASS — 7 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add src/commands/use.js src/__tests__/use.test.js
git commit -m "feat: record profile name in settings metadata"
```

---

### Task 2: 重写 `status.js`（local 优先解析 + 生效值展示）

**Files:**
- Modify: `src/commands/status.js`（全文件重写）
- Test: `src/__tests__/status.test.js`（全文件重写）

- [ ] **Step 1: 重写测试文件（失败测试）**

用以下内容**全量替换** `src/__tests__/status.test.js`：

```js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatStatus, maskToken, resolveEffectiveView } = require('../commands/status');

let tmpDir;
let localPath;
let globalPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-status-'));
  localPath = path.join(tmpDir, 'settings.local.json');
  globalPath = path.join(tmpDir, 'settings.json');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeSettings(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

test('maskToken keeps first 7 chars and last 4, hides middle', () => {
  expect(maskToken('sk-ant-abc123xyz')).toBe('sk-ant-***3xyz');
});

test('maskToken returns *** for short tokens', () => {
  expect(maskToken('short')).toBe('***');
});

test('resolveEffectiveView prefers local settings when present', () => {
  writeSettings(localPath, { model: 'sonnet', _ccSwitchProfile: 'glm', env: { ANTHROPIC_BASE_URL: 'https://local.test' } });
  writeSettings(globalPath, { model: 'opus', _ccSwitchProfile: 'opus', env: { ANTHROPIC_BASE_URL: 'https://global.test' } });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.scope).toBe('local');
  expect(view.sourcePath).toBe(localPath);
  expect(view.baseUrl).toBe('https://local.test');
});

test('resolveEffectiveView falls back to global when local missing', () => {
  writeSettings(globalPath, { model: 'opus', _ccSwitchProfile: 'sonnet' });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.scope).toBe('global');
  expect(view.sourcePath).toBe(globalPath);
});

test('resolveEffectiveView returns null when neither file exists', () => {
  expect(resolveEffectiveView(localPath, globalPath, {})).toBeNull();
});

test('resolveEffectiveView falls back to state activeProfile for global files without metadata', () => {
  writeSettings(globalPath, { model: 'opus' });
  const view = resolveEffectiveView(localPath, globalPath, { activeProfile: 'glm' });
  expect(view.profileName).toBe('glm');
});

test('resolveEffectiveView shows (unknown) for local files without metadata', () => {
  writeSettings(localPath, { model: 'sonnet' });
  const view = resolveEffectiveView(localPath, globalPath, { activeProfile: 'glm' });
  expect(view.profileName).toBe('(unknown)');
});

test('resolveEffectiveView extracts model and env values from the effective file', () => {
  writeSettings(globalPath, {
    model: 'sonnet',
    _ccSwitchProfile: 'glm',
    env: {
      ANTHROPIC_MODEL: 'glm-5.1',
      ANTHROPIC_BASE_URL: 'https://api.test',
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-abc123xyz',
    },
  });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.model).toBe('sonnet');
  expect(view.anthropicModel).toBe('glm-5.1');
  expect(view.baseUrl).toBe('https://api.test');
  expect(view.authToken).toBe('sk-ant-abc123xyz');
});

test('resolveEffectiveView returns undefined for missing env keys', () => {
  writeSettings(globalPath, { model: 'opus' });
  const view = resolveEffectiveView(localPath, globalPath, {});
  expect(view.anthropicModel).toBeUndefined();
  expect(view.baseUrl).toBeUndefined();
  expect(view.authToken).toBeUndefined();
});

test('resolveEffectiveView throws on corrupt JSON', () => {
  fs.writeFileSync(localPath, '{not json', 'utf8');
  expect(() => resolveEffectiveView(localPath, globalPath, {})).toThrow(/Failed to parse/);
});

test('formatStatus renders view lines with masked token', () => {
  const view = {
    scope: 'local',
    sourcePath: './.claude/settings.local.json',
    profileName: 'glm',
    model: 'sonnet',
    anthropicModel: 'glm-5.1',
    baseUrl: 'https://proxy.test',
    authToken: 'sk-ant-abc123xyz',
  };
  const text = formatStatus(view).join('\n');
  expect(text).toContain('Source         : ./.claude/settings.local.json (local)');
  expect(text).toContain('Active profile : glm');
  expect(text).toContain('Model (top)    : sonnet');
  expect(text).toContain('ANTHROPIC_MODEL: glm-5.1');
  expect(text).toContain('BASE_URL       : https://proxy.test');
  expect(text).toContain('AUTH_TOKEN     : sk-ant-***3xyz');
  expect(text).not.toContain('sk-ant-abc123xyz');
});

test('formatStatus omits ANTHROPIC_MODEL line when absent', () => {
  const view = {
    scope: 'global',
    sourcePath: '~/.claude/settings.json',
    profileName: 'sonnet',
    model: 'sonnet',
    anthropicModel: undefined,
    baseUrl: 'https://api.test',
    authToken: 'sk-ant-abc123xyz',
  };
  expect(formatStatus(view).join('\n')).not.toContain('ANTHROPIC_MODEL');
});

test('formatStatus shows not set for missing model, baseUrl and authToken', () => {
  const view = {
    scope: 'global',
    sourcePath: '~/.claude/settings.json',
    profileName: 'sonnet',
    model: undefined,
    anthropicModel: undefined,
    baseUrl: undefined,
    authToken: undefined,
  };
  const text = formatStatus(view).join('\n');
  expect(text).toContain('Model (top)    : not set');
  expect(text).toContain('BASE_URL       : not set');
  expect(text).toContain('AUTH_TOKEN     : not set');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/__tests__/status.test.js`
Expected: FAIL — `resolveEffectiveView is not a function`（模块尚未导出）；两个 `maskToken` 用例 PASS。

- [ ] **Step 3: 重写 `src/commands/status.js`**

用以下内容**全量替换** `src/commands/status.js`：

```js
'use strict';
const fs = require('fs');
const { getClaudeSettingsPath, getLocalClaudeSettingsPath } = require('../paths');
const { readState } = require('../config');

function maskToken(token) {
  if (!token || token.length < 12) return '***';
  return token.slice(0, 7) + '***' + token.slice(-4);
}

function resolveEffectiveView(localPath, globalPath, state = {}) {
  const sourcePath = fs.existsSync(localPath) ? localPath
    : fs.existsSync(globalPath) ? globalPath
    : null;
  if (!sourcePath) return null;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${sourcePath}: ${err.message}`);
  }
  const scope = sourcePath === localPath ? 'local' : 'global';
  const env = settings.env || {};
  const profileName = settings._ccSwitchProfile
    || (scope === 'global' && state.activeProfile)
    || '(unknown)';
  return {
    scope,
    sourcePath,
    profileName,
    model: settings.model,
    anthropicModel: env.ANTHROPIC_MODEL,
    baseUrl: env.ANTHROPIC_BASE_URL,
    authToken: env.ANTHROPIC_AUTH_TOKEN,
  };
}

function formatStatus(view) {
  const lines = [
    `Source         : ${view.sourcePath} (${view.scope})`,
    `Active profile : ${view.profileName}`,
    `Model (top)    : ${view.model || 'not set'}`,
  ];
  if (view.anthropicModel) {
    lines.push(`ANTHROPIC_MODEL: ${view.anthropicModel}`);
  }
  lines.push(`BASE_URL       : ${view.baseUrl || 'not set'}`);
  lines.push(`AUTH_TOKEN     : ${view.authToken ? maskToken(view.authToken) : 'not set'}`);
  return lines;
}

function run() {
  const state = readState();
  let view;
  try {
    view = resolveEffectiveView(
      getLocalClaudeSettingsPath(process.cwd()),
      getClaudeSettingsPath(),
      state
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (!view) {
    console.log('No active settings found. Run `cc-switch use <profile>` or `cc-switch local <profile>` to activate one.');
    return;
  }
  formatStatus(view).forEach(l => console.log(l));
}

module.exports = { formatStatus, maskToken, resolveEffectiveView, run };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest src/__tests__/status.test.js`
Expected: PASS — 13 个用例全过。

- [ ] **Step 5: Commit**

```bash
git add src/commands/status.js src/__tests__/status.test.js
git commit -m "feat: status reads effective settings with local priority"
```

---

### Task 3: README 更新与全量回归

**Files:**
- Modify: `README.md:51`（命令表 status 行）、`README.md:69`（How It Works 末尾追加说明）

- [ ] **Step 1: 更新命令表 status 行**

`README.md` 命令表中这一行：

```markdown
| `cc-switch status` | Show active profile and key settings (TOKEN masked) |
```

改为：

```markdown
| `cc-switch status` | Show effective settings: reads `./.claude/settings.local.json` first, falls back to `~/.claude/settings.json` (TOKEN masked) |
```

- [ ] **Step 2: How It Works 追加 status 说明**

`README.md` 中 `How It Works` 一节的这句之后：

```markdown
Credentials in `private.json` are always injected last and never appear in any template file.
```

追加：

```markdown
`status` always shows what Claude Code actually reads: it prefers `./.claude/settings.local.json`
over the global file, and takes `BASE_URL` / `AUTH_TOKEN` from the effective file's `env` — so a
custom profile overriding those values is reflected correctly. Switched files carry a
`_ccSwitchProfile` marker so `status` can name the active profile; Claude Code ignores it.
```

- [ ] **Step 3: 全量测试回归**

Run: `npx jest`
Expected: PASS — 全部测试文件通过（含 Task 1、Task 2 的用例与其余既有用例）。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for status effective-settings behavior"
```

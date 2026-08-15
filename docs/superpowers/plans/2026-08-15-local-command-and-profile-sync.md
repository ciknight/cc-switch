# `cc-switch local` 命令与安装时 profiles 同步实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `cc-switch local <profile>` 命令（写 `./.claude/settings.local.json`，只对当前项目生效），并通过 `postinstall` 钩子在每次安装时把仓库内置 profiles 同步到 `~/.cc-switch`。

**Architecture:** `local` 命令复用 `use.run(profile, { local: true })`，`paths.js` 的 local 路径改指 `settings.local.json`；profiles 同步逻辑抽成 `src/sync-profiles.js`，被 `init` 和新的 `scripts/postinstall.js` 共用。

**Tech Stack:** Node.js (>=18, CommonJS)、commander、jest。

**Spec:** `docs/superpowers/specs/2026-08-15-local-command-and-profile-sync-design.md`

---

### Task 1: `getLocalClaudeSettingsPath` 改指 `settings.local.json`

**Files:**
- Modify: `src/paths.js:17-19`
- Test: `src/__tests__/paths.test.js:18-20`

- [ ] **Step 1: 更新测试期望（先失败）**

`src/__tests__/paths.test.js` 第 18-20 行改为：

```js
test('getLocalClaudeSettingsPath returns .claude/settings.local.json under given dir', () => {
  expect(getLocalClaudeSettingsPath('/project')).toBe(path.join('/project', '.claude', 'settings.local.json'));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest paths`
Expected: FAIL — `getLocalClaudeSettingsPath` 测试期望 `settings.local.json`，实际得到 `settings.json`。

- [ ] **Step 3: 修改实现**

`src/paths.js` 第 17-19 行改为：

```js
function getLocalClaudeSettingsPath(cwd) {
  return path.join(cwd, '.claude', 'settings.local.json');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest paths`
Expected: PASS（4 个测试全过）

- [ ] **Step 5: 提交**

```bash
git add src/paths.js src/__tests__/paths.test.js
git commit -m "feat: target .claude/settings.local.json for project-local settings"
```

---

### Task 2: `use` —— local 运行不写全局 `state.json`

**Files:**
- Modify: `src/commands/use.js:8-16,30`
- Test: `src/__tests__/use.test.js`

- [ ] **Step 1: 新增失败测试**

`src/__tests__/use.test.js` 末尾追加（`beforeEach` 已把 `state.json` 写为 `{}`）：

```js
test('applyProfile with recordState:false leaves state.json untouched', () => {
  const ccDir = path.join(tmpDir, 'cc');
  applyProfile('glm', path.join(tmpDir, 'settings.local.json'), ccDir, { recordState: false });
  const state = JSON.parse(fs.readFileSync(path.join(ccDir, 'state.json'), 'utf8'));
  expect(state).toEqual({});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest use`
Expected: FAIL — 新测试中 `applyProfile` 仍无条件写 `state.json`，`state.activeProfile` 为 `'glm'` 而非 `{}`。

- [ ] **Step 3: 修改 `src/commands/use.js`**

`applyProfile` 改为（第 8-16 行）：

```js
function applyProfile(profileName, settingsPath, configDir, { recordState = true } = {}) {
  const base = readJson(path.join(configDir, 'base.json'));
  const profile = readJson(path.join(configDir, 'profiles', `${profileName}.json`));
  const priv = readJson(path.join(configDir, 'private.json'));
  const settings = buildSettings(base, profile, priv);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeJson(settingsPath, settings);
  if (recordState) {
    writeJson(path.join(configDir, 'state.json'), { activeProfile: profileName });
  }
}
```

`run` 中调用处（第 30 行）改为：

```js
  applyProfile(profileName, settingsPath, configDir, { recordState: !options.local });
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest use`
Expected: PASS（5 个测试全过，含原有的 `applyProfile updates state.json`——默认 `recordState` 为 true）

- [ ] **Step 5: 提交**

```bash
git add src/commands/use.js src/__tests__/use.test.js
git commit -m "feat: keep project-local switches out of global state.json"
```

---

### Task 3: 新增 `src/sync-profiles.js` 共享同步模块

**Files:**
- Create: `src/sync-profiles.js`
- Test: `src/__tests__/sync-profiles.test.js`（新建）

- [ ] **Step 1: 新建失败测试文件**

`src/__tests__/sync-profiles.test.js`：

```js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BUNDLED_PROFILES_DIR, getBundledProfiles, syncProfiles } = require('../sync-profiles');

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-sync-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

test('getBundledProfiles lists repo profiles without extension', () => {
  const names = getBundledProfiles();
  expect(names).toContain('sonnet');
  expect(names).toContain('opus');
  expect(names).toContain('glm');
  for (const name of names) {
    expect(fs.existsSync(path.join(BUNDLED_PROFILES_DIR, `${name}.json`))).toBe(true);
  }
});

test('syncProfiles creates target dir and copies all bundled profiles + manifest', () => {
  const target = path.join(tmpDir, 'fresh');
  const bundled = getBundledProfiles();
  const synced = syncProfiles(target);
  expect(synced).toEqual(bundled);
  for (const name of bundled) {
    expect(fs.readFileSync(path.join(target, 'profiles', `${name}.json`), 'utf8'))
      .toBe(fs.readFileSync(path.join(BUNDLED_PROFILES_DIR, `${name}.json`), 'utf8'));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'profiles.manifest.json'), 'utf8'));
  expect(manifest).toEqual(bundled);
});

test('syncProfiles overwrites stale built-in profiles with bundled versions', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'sonnet.json'), '{"outdated":true}', 'utf8');
  syncProfiles(tmpDir);
  const synced = JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles', 'sonnet.json'), 'utf8'));
  expect(synced).toEqual(JSON.parse(fs.readFileSync(path.join(BUNDLED_PROFILES_DIR, 'sonnet.json'), 'utf8')));
});

test('syncProfiles preserves custom profiles not in the manifest', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  const custom = { model: 'my-model', env: { ANTHROPIC_MODEL: 'my-model' } };
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'custom.json'), JSON.stringify(custom), 'utf8');
  syncProfiles(tmpDir);
  expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'profiles', 'custom.json'), 'utf8'))).toEqual(custom);
});

test('syncProfiles removes managed profiles that are no longer bundled', () => {
  fs.mkdirSync(path.join(tmpDir, 'profiles'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'profiles', 'retired.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'profiles.manifest.json'), JSON.stringify(['retired', 'sonnet']), 'utf8');
  syncProfiles(tmpDir);
  expect(fs.existsSync(path.join(tmpDir, 'profiles', 'retired.json'))).toBe(false);
  expect(fs.existsSync(path.join(tmpDir, 'profiles', 'sonnet.json'))).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest sync-profiles`
Expected: FAIL — `Cannot find module '../sync-profiles'`。

- [ ] **Step 3: 新建 `src/sync-profiles.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');

const BUNDLED_PROFILES_DIR = path.join(__dirname, '..', 'profiles');

function getBundledProfiles() {
  return fs.readdirSync(BUNDLED_PROFILES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));
}

function readManifest(targetDir) {
  const p = path.join(targetDir, 'profiles.manifest.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function syncProfiles(targetDir) {
  const profilesDir = path.join(targetDir, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });

  const bundled = getBundledProfiles();

  // Remove managed profiles that are no longer bundled (renamed/dropped upstream).
  for (const name of readManifest(targetDir)) {
    if (!bundled.includes(name)) {
      const stale = path.join(profilesDir, `${name}.json`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
  }

  // Built-in profiles are managed by cc-switch: always overwrite with the bundled copy.
  for (const name of bundled) {
    fs.copyFileSync(
      path.join(BUNDLED_PROFILES_DIR, `${name}.json`),
      path.join(profilesDir, `${name}.json`)
    );
  }

  fs.writeFileSync(
    path.join(targetDir, 'profiles.manifest.json'),
    JSON.stringify(bundled, null, 2) + '\n',
    'utf8'
  );
  return bundled;
}

module.exports = { BUNDLED_PROFILES_DIR, getBundledProfiles, syncProfiles };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest sync-profiles`
Expected: PASS（5 个测试全过）

- [ ] **Step 5: 提交**

```bash
git add src/sync-profiles.js src/__tests__/sync-profiles.test.js
git commit -m "feat: add shared sync-profiles module for built-in profile sync"
```

---

### Task 4: `init.js` 改用共享的 `syncProfiles`

**Files:**
- Modify: `src/commands/init.js:7-13,30-42`
- Test: `src/__tests__/init.test.js`（不修改，作为回归）

- [ ] **Step 1: 先跑一遍 init 测试确认当前全绿（回归基线）**

Run: `npx jest init`
Expected: PASS（5 个测试全过）

- [ ] **Step 2: 重构 `src/commands/init.js`**

删除第 7-13 行的 `BUNDLED_PROFILES_DIR` / `getBundledProfiles`，改为引入共享模块。文件头部改为：

```js
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getCCSwitchDir } = require('../paths');
const { syncProfiles } = require('../sync-profiles');

const BUNDLED_BASE = path.join(__dirname, '..', 'templates', 'base.json');
```

`setupConfig` 中删除 profiles 复制循环和 manifest 写入（原第 30-42 行），替换为：

```js
    fs.copyFileSync(BUNDLED_BASE, path.join(targetDir, 'base.json'));

    syncProfiles(targetDir);
```

`setupConfig` 完整结果：

```js
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
```

`prompt` / `run` / `module.exports` 保持不变。

- [ ] **Step 3: 跑测试确认回归通过**

Run: `npx jest init`
Expected: PASS（5 个测试全过，对外契约不变：private + base + profiles + manifest 都落盘）

- [ ] **Step 4: 提交**

```bash
git add src/commands/init.js
git commit -m "refactor: init uses shared sync-profiles module"
```

---

### Task 5: `scripts/postinstall.js` + `package.json` 钩子

**Files:**
- Create: `scripts/postinstall.js`
- Modify: `package.json`（scripts 段）

- [ ] **Step 1: 新建 `scripts/postinstall.js`**

```js
#!/usr/bin/env node
'use strict';
/**
 * postinstall hook: sync bundled profiles into ~/.cc-switch.
 * Runs on `yarn install` / `npm install` / `npm install -g .` / `npm link`.
 * Never fails the install — errors are reported as warnings only.
 */
const { syncProfiles } = require('../src/sync-profiles');
const { getCCSwitchDir } = require('../src/paths');

try {
  const synced = syncProfiles(getCCSwitchDir());
  console.log(`cc-switch: synced ${synced.length} built-in profiles to ${getCCSwitchDir()}`);
} catch (err) {
  console.warn(`cc-switch: profile sync failed (${err.message}). Run \`cc-switch init\` to set up manually.`);
}
```

- [ ] **Step 2: `package.json` 注册 postinstall**

`scripts` 段改为：

```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "setup": "node scripts/install.js",
    "teardown": "node scripts/uninstall.js",
    "postinstall": "node scripts/postinstall.js"
  },
```

- [ ] **Step 3: 手动验证（真实同步到 ~/.cc-switch）**

Run: `node scripts/postinstall.js`
Expected: 输出 `cc-switch: synced 6 built-in profiles to C:\Users\ci_kn\.cc-switch`，退出码 0。

再确认内容确实更新：

Run: `node -e "console.log(require('os').homedir())"` 拿到 home 后，检查 `%USERPROFILE%\.cc-switch\profiles\` 下 6 个 json 与仓库 `profiles/` 一致（例如 `git diff --no-index profiles/glm.json "$USERPROFILE/.cc-switch/profiles/glm.json"` 无输出）。

- [ ] **Step 4: 验证 npm install 会触发钩子**

Run: `npm install`
Expected: 安装输出中包含 `cc-switch: synced 6 built-in profiles to ...` 一行。

- [ ] **Step 5: 提交**

```bash
git add scripts/postinstall.js package.json
git commit -m "feat: sync built-in profiles to ~/.cc-switch on install via postinstall"
```

---

### Task 6: `bin/cli.js` 新增 `local` 命令

**Files:**
- Modify: `bin/cli.js:16-20`

- [ ] **Step 1: 修改 `bin/cli.js`**

`use` 命令的 `--local` 描述更新，并在其后新增 `local` 命令（第 16-20 行区域）：

```js
program
  .command('use <profile>')
  .description('Activate a profile (writes ~/.claude/settings.json by default)')
  .option('--local', 'Write to ./.claude/settings.local.json (project-only, not committed)')
  .action((profile, options) => require('../src/commands/use').run(profile, options));

program
  .command('local <profile>')
  .description('Activate a profile for the current project only (writes ./.claude/settings.local.json)')
  .action((profile) => require('../src/commands/use').run(profile, { local: true }));
```

- [ ] **Step 2: 验证 help 输出**

Run: `node bin/cli.js --help`
Expected: 命令列表中包含 `local <profile>` 一行。

Run: `node bin/cli.js use --help`
Expected: `--local` 描述为 `Write to ./.claude/settings.local.json (project-only, not committed)`。

- [ ] **Step 3: 端到端验证 local 命令（在临时目录中）**

```bash
# 记录当前 state.json 内容
cat "$USERPROFILE/.cc-switch/state.json"
# 在空目录中执行 local 切换
mkdir -p /tmp/cc-local-e2e && cd /tmp/cc-local-e2e
node /f/code/cc-switch/bin/cli.js local sonnet
```

Expected:
- 输出 `Switched to profile "sonnet" (local)` 和 `Written to: ...\.claude\settings.local.json`；
- `/tmp/cc-local-e2e/.claude/settings.local.json` 存在，且 `env.ANTHROPIC_AUTH_TOKEN` 有值；
- 再次 `cat "$USERPROFILE/.cc-switch/state.json"` —— 内容与之前**完全一致**（未被 local 切换污染）。

Windows 下 `/tmp` 即 Git Bash 的临时目录；也可用任意空目录。验证完 `cd` 回原目录并删除该目录。

- [ ] **Step 4: 跑全量测试**

Run: `npm test`
Expected: 全部测试套件 PASS（paths / use / sync-profiles / init / add / edit / list / merge / remove / status / config）。

- [ ] **Step 5: 提交**

```bash
git add bin/cli.js
git commit -m "feat: add cc-switch local command for project-only settings"
```

---

### Task 7: README 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 Features 列表（第 9 行）**

```markdown
- Global (`~/.claude/settings.json`) and per-project (`.claude/settings.local.json`) switching
```

- [ ] **Step 2: 更新 Quick Start（第 32-34 行）**

```markdown
# Switch for the current project only
cc-switch local opus
```

- [ ] **Step 3: 更新命令表（第 44-55 行区域）**

将 `cc-switch use <profile> --local` 一行替换为两行：

```markdown
| `cc-switch use <profile> --local` | Activate for current project only (writes `./.claude/settings.local.json`) |
| `cc-switch local <profile>` | Shortcut for `use <profile> --local` |
```

- [ ] **Step 4: Configuration Directory 一节末尾（第 84 行后）追加同步说明**

```markdown
Built-in profiles are re-synced from the package on every install (`postinstall` hook):
built-in profiles are always overwritten with the bundled versions, custom profiles are never touched.
```

- [ ] **Step 5: 提交**

```bash
git add README.md
git commit -m "docs: document cc-switch local command and install-time profile sync"
```

---

## 备注

- **兼容性**：`use --local` 旧行为写 `./.claude/settings.json`（会被 git 提交，有 token 泄露隐患），新行为写 `./.claude/settings.local.json`。已生成的旧文件不做迁移，用户自行删除即可。
- **`yarn link` 说明**：`yarn link` 本身不一定触发生命周期脚本，但 `yarn install` / `npm install` 会触发 postinstall；link 场景下仓库即运行目录，install 一次后 profiles 即同步，满足需求。
- README 的 Built-in Profiles 表只列了 sonnet/opus/glm（缺少 kimi/mimo/minimax），属既有文档漂移，不在本计划范围内。

# cc-switch `init-claude` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cc-switch init-claude`, which scaffolds a project `CLAUDE.md` and `docs/` directories from a bundled template, then starts an interactive Claude Code interview that fills the file in.

**Architecture:** A new command module owns all deterministic work (template rendering, docs scaffolding, overwrite protection, launching and cleaning up a temporary interview prompt). Claude Code owns the interview and final write. The launch layer reuses `env.js`'s `resolveClaudeBin` and `quoteCmdArg`, and mirrors its Windows `cmd.exe` invocation and cleanup-on-exit patterns without changing `env.js`.

**Tech Stack:** Node.js >= 18 (CommonJS), commander v12, Jest 29. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-init-claude-design.md`

## Global Constraints

- Node.js >= 18; CommonJS (`'use strict'`, `require`); commander v12; Jest 29.
- No new runtime or dev dependencies.
- Must work on Windows, macOS, and Linux; Windows may resolve `claude.cmd` and must go through `cmd.exe`.
- User-facing output and generated files are Chinese; code identifiers remain English.
- Do not modify the behavior of `init`, `use`, `local`, `env`, `list`, `status`, `add`, `edit`, or `remove`.
- Bundled assets live under `src/templates/claude-md/`; `package.json` already ships `src/`.
- Generated `CLAUDE.md` is the highest constraint document, key information only; details are referenced from `docs/`.
- Defaults written into the template: DDD, RESTful APIs, MCP for AI/tool integration, GitHub Flow.
- `--force` backs up an existing `CLAUDE.md` to `CLAUDE.md.bak` before overwriting.
- The temporary prompt `.claude/cc-switch-init-claude.md` is deleted when claude exits or fails.
- `--no-launch` must never resolve, spawn, or require `claude`.

## Review Focus

1. **Windows `.cmd` shim + Chinese initial message** — the message must survive `cmd.exe /c`, and the command line must include `chcp 65001>nul &`; a wrong quoting path silently drops or garbles the message. Pinned by the `buildClaudeInvocation` Windows test in Task 3.
2. **Existing `CLAUDE.md` safety** — without `--force` the file must be untouched; with `--force` the old content must be preserved in `CLAUDE.md.bak`. Pinned by the `prepareTarget` tests in Task 2.
3. **claude missing or spawn failure** — the command must fail cleanly and leave no prompt file behind. Pinned by the `launch` rejection tests in Task 3.
4. **`--no-launch` on a machine without claude** — the command must complete using only the filesystem. Pinned by the `run` test in Task 4.
5. **Project path containing spaces or Unicode** — `cwd` and template reads must work; the initial message stays relative, so no path needs cmd quoting. Pinned by a spaces-in-path `launch` test in Task 3.

---

## Task 1: Bundled `CLAUDE.md` template and interview prompt

**Files:**
- Create: `src/templates/claude-md/CLAUDE.template.md`
- Create: `src/templates/claude-md/init-prompt.md`
- Test: `src/__tests__/init-claude.test.js`

**Interfaces:**
- Produces: two UTF-8 asset files whose contents are fixed below. Later tasks read them by path.
- Produces: `CLAUDE.template.md` placeholders `{{PROJECT_NAME}}` and `{{DATE}}`; `init-prompt.md` placeholders `{{PROJECT_NAME}}` and `{{DATE}}`.

- [ ] **Step 1: Write the failing asset tests**

Create `src/__tests__/init-claude.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: FAIL with `ENOENT: no such file or directory` for `src/templates/claude-md/CLAUDE.template.md`.

- [ ] **Step 3: Create `src/templates/claude-md/CLAUDE.template.md` with exactly this content**

````markdown
# {{PROJECT_NAME}}

> 本文件是本项目的最高约束：当其他文档、口头约定或第三方示例与本文件冲突时，以本文件为准。
> 本文件只记录关键信息，不承载细节。需要展开的内容写入 `docs/` 对应目录，并在此引用路径。
> 修改本文件前，先判断是否应该更新被引用的文档；不要在两处重复同一细节。

## 1. 项目信息

- 一句话定位：TODO
- 目标用户：TODO
- 核心场景：TODO
- 当前阶段：TODO
- 非目标（明确不做）：TODO
- 成功标准：TODO

## 2. 技术栈与语言约束

- 开发语言 / 最低版本：TODO
- 框架 / 主要依赖（含版本）：TODO
- 包管理器 / 构建命令：TODO
- 代码风格 / 格式化 / 静态检查：TODO
- 测试框架与门禁：TODO
- 禁止事项：TODO

## 3. 架构模式

- 架构模式：DDD（领域驱动设计）
- 分层与依赖方向：
  - 接口层（interface）→ 应用层（application）→ 领域层（domain）
  - 基础设施层（infrastructure）实现领域层定义的端口，依赖指向领域层
- 聚合 / 实体 / 值对象 / 领域服务 / 仓储的职责边界：TODO
- 跨模块通信：领域事件 / 应用服务编排；禁止跨模块直接访问对方仓储
- 详细设计：`docs/spec/architecture.md`

## 4. API 与集成约定

- 普通后端 API：RESTful
  - 路径与版本：`/api/v1/<resource>`
  - 错误格式、分页、幂等、鉴权：TODO
- AI 能力 / 工具集成：优先 MCP（Model Context Protocol）
  - 工具命名、输入输出 schema、权限边界：TODO
- 第三方 API：统一封装在基础设施层，不进入领域层
- 契约文档：`docs/spec/api.md`

## 5. 模块结构

<!-- 按项目实际结构调整；保持模块边界与依赖方向一致 -->

```text
src/
├── modules/
│   └── <bounded-context>/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       └── interface/
└── shared/
```

- 模块职责：TODO
- 新增模块的准入条件：TODO

## 6. 文档结构与关键路径

所有项目文档放在 `docs/` 下：

| 目录 | 用途 | 关键文档 |
|---|---|---|
| `docs/spec/` | 需求规格、架构与 API 设计 | `architecture.md`、`api.md` |
| `docs/plan/` | 实施计划、里程碑、任务拆解 | |
| `docs/guide/` | 开发、运行、部署、使用指南 | `overview.md`、`development.md` |
| `docs/reference/` | 官方资料、第三方参考、决策记录 | |

- 写作规则：需求 → spec；方案/排期 → plan；操作/交付 → guide；外部资料 → reference。
- 关键文档入口：`docs/guide/overview.md`

## 7. 参考资料与第三方边界

- 官方文档优先；与第三方资料冲突时以官方为准。
- 第三方资料只作参考：引入代码或方案前核对版本、许可证与维护状态。
- 外部代码片段不得直接复制进领域层；需要复用时先封装为基础设施层适配器。
- 参考链接与结论记录到 `docs/reference/`，不散落在代码注释里。

## 8. 工作流与交付约束

- Git workflow：GitHub Flow
  - `main` 受保护，禁止直接推送
  - 分支：`feat/<topic>`、`fix/<topic>`、`docs/<topic>`、`chore/<topic>`
  - 提交：Conventional Commits（`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`）
  - 合并：PR + 至少一次评审 + squash merge
- 提交前门禁：格式化、静态检查、测试全部通过
- 一次变更只做一件事；跨模块改动先更新 spec / plan
- 不提交密钥、token、真实用户数据；配置走环境变量
- 完成汇报：改了什么、为什么、如何验证、剩余风险

## 9. 变更记录

- 结构性变更（架构、技术栈、目录约定）必须先改本文件，再改代码。
````

- [ ] **Step 4: Create `src/templates/claude-md/init-prompt.md` with exactly this content**

````markdown
# 项目初始化访谈

你正在为项目 `{{PROJECT_NAME}}`（路径：当前目录）初始化 `CLAUDE.md`。初始日期：{{DATE}}。

## 目标

通过一次简短、聚焦的访谈，把项目的关键约束写入项目根目录的 `CLAUDE.md`。

`CLAUDE.md` 是项目的最高约束，但只记录关键信息；详细内容放到 `docs/` 下，并在 `CLAUDE.md` 中用路径引用。目标长度 80–150 行，超过 200 行视为需要拆分。

## 开始前

1. 读取项目根目录的 `CLAUDE.md`（这是已生成的骨架）。
2. 读取现有目录结构和关键配置文件（如 `package.json`、`pyproject.toml`、`go.mod`、`Cargo.toml`、`Makefile`），不要凭猜测提问。
3. 如果项目是空的，直接从第一个问题开始。

## 访谈规则

- 一次只问一个问题；优先使用 `AskUserQuestion`，选项要具体、互斥。
- 第一个问题必须是开放式的：「这个项目是做什么的？为谁解决什么问题？」
- 每个问题都基于上一个回答或你读到的代码，不要照着清单机械提问。
- 用户不确定的项写 `TODO`，不要编造。
- 默认值必须显式确认，不能默默采用。
- 每完成一个主题，用 2–3 句话复述你的理解，确认后再写入。
- 全程使用中文。

## 必须覆盖的主题

1. **项目信息**：一句话定位、目标用户、核心场景、当前阶段、非目标、成功标准。
2. **语言与框架**：开发语言及最低版本、框架及版本、包管理器/构建命令、代码风格/格式化/静态检查、测试框架与门禁、禁止事项。
3. **架构模式**：默认推荐 DDD。必须确认分层与依赖方向（接口层 → 应用层 → 领域层；基础设施层实现端口）、聚合/实体/值对象/领域服务/仓储边界、跨模块通信方式。若用户选择其他架构，明确记录理由。
4. **API 与集成**：普通后端 API 默认推荐 RESTful，确认路径与版本（如 `/api/v1/<resource>`）、错误格式、分页、幂等、鉴权；AI 能力/工具集成默认推荐 MCP，确认工具命名、输入输出 schema、权限边界；第三方 API 的封装位置。
5. **模块结构**：根据现有目录提出模块划分建议，确认模块职责和新增模块的准入条件。
6. **文档结构**：确认 `docs/spec`、`docs/plan`、`docs/guide`、`docs/reference` 的用途与关键文档路径。
7. **参考资料边界**：官方文档优先；第三方资料只作参考，引入前核对版本、许可证与维护状态；外部代码不得直接复制进领域层。
8. **工作流**：Git workflow（默认 GitHub Flow：`main` 保护、`feat/` `fix/` `docs/` `chore/` 分支、Conventional Commits、PR + 评审 + squash merge）、提交前门禁、评审习惯、完成汇报格式。

## 写入规则

- 访谈结束后，重写项目根目录的 `CLAUDE.md`：
  - 保留骨架的 9 个章节和顺序，项目信息必须在最上层。
  - 删除所有 `{{...}}` 占位符和 `TODO` 中已确认的内容；确实无法确定的保留 `TODO`。
  - 只保留关键约束、命令、路径和边界；实现细节不要写进来。
- 需要展开的内容写入 `docs/` 对应目录：
  - 架构细节 → `docs/spec/architecture.md`
  - API 契约 → `docs/spec/api.md`
  - 项目概览 → `docs/guide/overview.md`
  - 开发指南 → `docs/guide/development.md`
  - 排期与任务拆解 → `docs/plan/`
  - 官方资料与第三方参考 → `docs/reference/`
- 在 `CLAUDE.md` 中用相对路径引用这些文档。
- 不要修改业务代码、不要安装依赖、不要执行与初始化无关的命令。
- 不要删除用户已有且仍然有效的内容；在现有基础上重组。

## 结束

输出一段简短总结：

1. 已确定的约束（按主题列 3–8 条）
2. 仍为 `TODO` 的项
3. 建议的下一步（例如先补 `docs/spec/architecture.md`）
````

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/templates/claude-md src/__tests__/init-claude.test.js
git commit -m "feat: add init-claude template and interview prompt"
```

---

## Task 2: Deterministic preparation helpers

**Files:**
- Create: `src/commands/init-claude.js`
- Modify: `src/__tests__/init-claude.test.js` (append tests)

**Interfaces:**
- Consumes: `src/templates/claude-md/CLAUDE.template.md` from Task 1.
- Produces:
  - `formatDate(date: Date): string` → `YYYY-MM-DD` using local time.
  - `renderTemplate(template: string, vars: object): string` → replaces `{{KEY}}` for keys present in `vars`; unknown placeholders are left untouched.
  - `assertProjectDir(projectDir: string): void` → throws `project directory not found: <dir>` or `not a directory: <dir>`.
  - `scaffoldDocs(projectDir: string): void` → creates `docs/{spec,plan,guide,reference}/.gitkeep` idempotently.
  - `prepareTarget({ projectDir, force?: boolean, templatePath?: string, now?: Date }): { claudeMdPath: string, backupPath: string|null }`.

- [ ] **Step 1: Append failing tests for the helpers**

Append to `src/__tests__/init-claude.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: FAIL with `Cannot find module '../commands/init-claude'`.

- [ ] **Step 3: Implement the helpers in `src/commands/init-claude.js`**

Create the module with `'use strict';`, `fs`, `path`, and these constants:

```js
const BUNDLED_TEMPLATE = path.join(__dirname, '..', 'templates', 'claude-md', 'CLAUDE.template.md');
const BUNDLED_PROMPT = path.join(__dirname, '..', 'templates', 'claude-md', 'init-prompt.md');
const PROMPT_RELATIVE_PATH = path.join('.claude', 'cc-switch-init-claude.md');
const INITIAL_MESSAGE = '请读取 .claude/cc-switch-init-claude.md 并按其说明执行。';
const DOC_DIRS = ['spec', 'plan', 'guide', 'reference'];
```

Implement exactly these signatures:

```js
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
```

Export `formatDate`, `renderTemplate`, `assertProjectDir`, `scaffoldDocs`, `prepareTarget` (and the constants) via `module.exports`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/init-claude.js src/__tests__/init-claude.test.js
git commit -m "feat: add init-claude template rendering and scaffolding helpers"
```

---

## Task 3: Interactive launch and cleanup

**Files:**
- Modify: `src/commands/init-claude.js`
- Modify: `src/__tests__/init-claude.test.js` (append tests)

**Interfaces:**
- Consumes: `quoteCmdArg` and `resolveClaudeBin` from `src/commands/env.js`; `renderTemplate` and `formatDate` from Task 2; `init-prompt.md` from Task 1.
- Produces:
  - `buildClaudeInvocation(claudeBin: string, args: string[], platform?: string, comspec?: string): { command: string, args: string[] }`.
  - `launch({ projectDir, spawnFn?, resolveBin?, platform?, comspec?, initialMessage?, promptTemplatePath?, now? }): Promise<number>` → resolves with claude's exit code.
  - Constants `INITIAL_MESSAGE` and `PROMPT_RELATIVE_PATH`.

- [ ] **Step 1: Append failing tests for invocation and launch**

Append to `src/__tests__/init-claude.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: FAIL with `buildClaudeInvocation is not a function`.

- [ ] **Step 3: Implement `buildClaudeInvocation` and `launch`**

At the top of `src/commands/init-claude.js`, add:

```js
const { spawn } = require('child_process');
const { quoteCmdArg, resolveClaudeBin } = require('./env');
```

Implement:

```js
function buildClaudeInvocation(claudeBin, args, platform = process.platform, comspec = process.env.ComSpec) {
  if (platform !== 'win32') return { command: claudeBin, args };
  const cmdLine = 'chcp 65001>nul & ' + [claudeBin, ...args].map(quoteCmdArg).join(' ');
  return { command: comspec || 'cmd.exe', args: ['/d', '/s', '/c', cmdLine] };
}
```

Implement `launch` with this behavior:

1. Call `assertProjectDir(projectDir)`.
2. Call `resolveBin()` **before** writing the prompt file, so a missing claude leaves no prompt.
3. Read `promptTemplatePath` (default `BUNDLED_PROMPT`), render it with `{ PROJECT_NAME: path.basename(projectDir), DATE: formatDate(now) }`.
4. Define `cleanup()` that unlinks the prompt file and swallows errors.
5. Build the invocation with `buildClaudeInvocation(claudeBin, [initialMessage], platform, comspec)`, where `initialMessage` defaults to `INITIAL_MESSAGE`. Do this **before** writing the prompt file so a construction error cannot leave a stray file.
6. Create `path.dirname(promptPath)`, write the prompt to `path.join(projectDir, PROMPT_RELATIVE_PATH)`, then return a `Promise<number>` that mirrors `src/commands/env.js`:
   - Register `SIGINT`/`SIGTERM` handlers: first signal is ignored (the foreground claude owns it); a second signal calls `cleanup()`, then `process.exit(130)`.
   - Register `process.on('exit', cleanup)`.
   - `spawnFn(command, args, { cwd: projectDir, stdio: 'inherit' })`.
   - On `close`, detach listeners, `cleanup()`, resolve with `code == null ? 1 : code`.
   - On `error`, detach listeners, `cleanup()`, reject with `claude not found at "<command>". Check PATH or set CC_SWITCH_CLAUDE.` when `err.code === 'ENOENT'`, otherwise reject `err`.
   - Wrap the spawn call in `try/catch`; on a synchronous throw, `cleanup()` and rethrow.
7. If reading the template or building the invocation throws, no prompt file exists, so rethrow directly.

Export `buildClaudeInvocation`, `launch`, `INITIAL_MESSAGE`, and `PROMPT_RELATIVE_PATH`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/init-claude.js src/__tests__/init-claude.test.js
git commit -m "feat: launch interactive claude session for init-claude"
```

---

## Task 4: Command wiring, `run`, and documentation

**Files:**
- Modify: `src/commands/init-claude.js` (add `run`)
- Modify: `bin/cli.js` (register command)
- Modify: `src/__tests__/init-claude.test.js` (append `run` tests)
- Modify: `README.md` (command table + new section)
- Modify: `README.zh-CN.md` (命令表 + 新章节)

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `run(dir?: string, options?: object): Promise<void>`.
  - `options.force: boolean`
  - `options.template: string | undefined`
  - `options.launch: boolean` (`false` means `--no-launch`)
  - `options.spawnFn`, `options.resolveBin` for tests
  - `options.setExitCode(code: number): void`, defaulting to `code => { process.exitCode = code; }`

- [ ] **Step 1: Append failing tests for `run`**

Append to `src/__tests__/init-claude.test.js`:

```js
const { run } = require('../commands/init-claude');

describe('init-claude run', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-init-claude-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('run with launch:false writes files and never spawns claude', async () => {
    const spawnFn = jest.fn();
    const setExitCode = jest.fn();

    await run(tmpDir, { launch: false, spawnFn, setExitCode });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'spec', '.gitkeep'))).toBe(true);
  });

  test('run reports an existing CLAUDE.md without force and leaves it intact', async () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'old');
    const setExitCode = jest.fn();

    await run(tmpDir, { launch: false, setExitCode });

    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toBe('old');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: FAIL with `run is not a function`.

- [ ] **Step 3: Implement `run`**

Add to `src/commands/init-claude.js`:

```js
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
      console.log('Skipped launching claude (--no-launch). Run `claude` in the project and ask it to complete CLAUDE.md.');
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
```

Export `run`.

- [ ] **Step 4: Register the command in `bin/cli.js`**

Insert after the existing `init` command:

```js
program
  .command('init-claude [dir]')
  .description('Initialize a project CLAUDE.md from a template via an interactive claude session')
  .option('--force', 'Overwrite an existing CLAUDE.md (backs it up to CLAUDE.md.bak)')
  .option('--no-launch', 'Only write the CLAUDE.md skeleton and docs directories; do not start claude')
  .option('--template <path>', 'Use a custom CLAUDE.md template')
  .action((dir, options) => require('../src/commands/init-claude').run(dir, options));
```

Commander maps `--no-launch` to `options.launch === false`; `run` already checks that.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/__tests__/init-claude.test.js`
Expected: PASS, 19 tests.

Run the full suite: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Smoke-test the CLI**

Run:

```bash
node bin/cli.js init-claude --help
```

Expected: help output lists `[dir]`, `--force`, `--no-launch`, and `--template <path>`.

Create a temporary directory and run without claude:

```bash
node bin/cli.js init-claude /tmp/cc-switch-init-smoke --no-launch
ls /tmp/cc-switch-init-smoke
ls /tmp/cc-switch-init-smoke/docs
```

Expected: `CLAUDE.md` exists; `docs/spec`, `docs/plan`, `docs/guide`, `docs/reference` each exist with `.gitkeep`. Remove the smoke directory afterwards.

- [ ] **Step 7: Update `README.md`**

Add a row to the command table:

```markdown
| `cc-switch init-claude [dir]` | Scaffold a project `CLAUDE.md` + `docs/` directories, then run an interactive claude interview to fill it in |
```

Add a section after the Commands table:

```markdown
## Initializing a Project CLAUDE.md

```bash
cc-switch init-claude             # in the project root
cc-switch init-claude ../app      # or point at another directory
```

The command writes a `CLAUDE.md` skeleton and creates `docs/spec`, `docs/plan`,
`docs/guide`, and `docs/reference`, then starts an interactive Claude Code session
that interviews you about the project and fills in the file. `CLAUDE.md` is the
top-level constraint document; details live in `docs/` and are referenced by path.

| Option | Description |
|---|---|
| `--force` | Overwrite an existing `CLAUDE.md` (backs it up to `CLAUDE.md.bak`) |
| `--no-launch` | Write the skeleton and docs directories only; do not start claude |
| `--template <path>` | Use a custom `CLAUDE.md` template |
```

- [ ] **Step 8: Update `README.zh-CN.md`**

Add a row to the 命令 table:

```markdown
| `cc-switch init-claude [dir]` | 初始化项目 `CLAUDE.md` 与 `docs/` 目录,并启动 claude 交互访谈补全内容 |
```

Add a section after the 命令 table:

```markdown
## 初始化项目 CLAUDE.md

```bash
cc-switch init-claude             # 在项目根目录执行
cc-switch init-claude ../app      # 或指定其他目录
```

命令会写入 `CLAUDE.md` 骨架,创建 `docs/spec`、`docs/plan`、`docs/guide`、`docs/reference`,
然后启动交互式 Claude Code 会话,按模板询问项目定位、技术栈、架构、API、模块结构、
文档约定与工作流,并补全 `CLAUDE.md`。`CLAUDE.md` 只保留关键约束,细节放在 `docs/` 中按路径引用。

| 选项 | 说明 |
|---|---|
| `--force` | 覆盖已有 `CLAUDE.md`(先备份为 `CLAUDE.md.bak`) |
| `--no-launch` | 只写骨架和 docs 目录,不启动 claude |
| `--template <path>` | 使用自定义 `CLAUDE.md` 模板 |
```

- [ ] **Step 9: Commit**

```bash
git add bin/cli.js src/commands/init-claude.js src/__tests__/init-claude.test.js README.md README.zh-CN.md
git commit -m "feat: wire cc-switch init-claude command and document it"
```

---

## Final Verification

- [ ] Run `npm test` and confirm every suite passes.
- [ ] Run `node bin/cli.js init-claude --help` and confirm the four options are listed.
- [ ] In a throwaway directory, run `node bin/cli.js init-claude <dir> --no-launch`, confirm `CLAUDE.md` and `docs/{spec,plan,guide,reference}/.gitkeep` exist, then run it again and confirm it refuses without `--force`.
- [ ] Run it a third time with `--force` and confirm `CLAUDE.md.bak` contains the previous content.
- [ ] Confirm `git status` shows only the intended files.
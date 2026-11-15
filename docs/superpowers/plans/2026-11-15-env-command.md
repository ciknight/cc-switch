# cc-switch env 命令实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `cc-switch env <profile> [args...]` 命令——以指定 profile 的配置(env + model)通过 `claude --settings <临时文件>` 启动单次会话,不修改任何 settings 文件。

**Architecture:** 复用 `buildSettings` 合并 base+profile+private,只取 `env` 和 `model` 写入临时文件;解析 claude 可执行文件后 spawn 子进程(stdio inherit),等退出、透传退出码、删临时文件。win32 下经 `cmd.exe /d /s /c` 启动(兼容 `claude.cmd`)并做参数引号转义。

**Tech Stack:** Node.js >= 18(CommonJS)、commander v12、jest 29。不新增第三方依赖。

**Spec:** `docs/superpowers/specs/2026-11-15-env-command-design.md`

## Global Constraints

- CommonJS + `'use strict'`,与 `src/` 现有文件一致;不新增 npm 依赖
- 测试风格照 `src/__tests__/use.test.js`:真实临时目录注入 `configDir`,不做全局 mock
- 提交信息用 conventional 风格前缀(`feat:` / `docs:` / `test:`),按任务分别提交
- `--settings` 注入内容**只含 `env` 和 `model` 两个键**(spec"注入内容"一节),不得携带 permissions/plugins 等 base 键
- 不写 `state.json`,不改 `status`/`list` 行为
- token 不得出现在任何 stdout/stderr 输出中

## Review Focus

1. **Windows 带空格参数透传**:`cc-switch env glm -p "hello world"` 到达 claude 时仍是单个参数 → Task 2 的 `quoteCmdArg` 测试钉住
2. **claude 非零退出码**:退出码透传且临时文件仍被删除 → Task 3 测试钉住
3. **profile 不存在**:在写临时文件之前校验,列出可用 profile、exit 1,不留垃圾文件 → Task 3 测试钉住
4. **`init` 未做(private.json/base.json 缺失)**:给出 `Run cc-switch init` 提示而非堆栈 → Task 3 测试钉住(缺 base.json 的场景;readPrivate 同路径)
5. **`--print` 不启动 claude**:只打印 JSON → Task 3 测试钉住;Ctrl+C 信号清理在 Task 4 手动冒烟验证(jest 无法可靠模拟控制台信号)

---

### Task 1: `buildEnvSettings` — 生成注入内容

**Files:**
- Create: `src/commands/env.js`
- Test: `src/__tests__/env.test.js`

**Interfaces:**
- Consumes: `buildSettings(base, profile, priv)`(src/merge.js);`readJson(filePath)`(src/config.js)
- Produces: `buildEnvSettings(configDir: string, profileName: string) -> { env: object, model?: string }`;profile 文件不存在时抛 `Error`(消息 `profile "X" not found`);`base.json` 或 `private.json` 不存在时抛 `Error`(消息含 `Run \`cc-switch init\` first`)

- [ ] **Step 1: 写失败测试**(测试文件的 beforeEach 搭建同 use.test.js:mkdtemp 临时目录,写入 base.json / private.json / profiles/glm.json / profiles/sonnet.json,glm 的 env 含 `ANTHROPIC_MODEL: 'glm-5.1'`)

```js
test('buildEnvSettings returns merged env plus model only', () => {
  const out = buildEnvSettings(ccDir, 'glm');
  expect(out.env.ANTHROPIC_MODEL).toBe('glm-5.1');
  expect(out.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
  expect(out.env.ANTHROPIC_BASE_URL).toBe('https://api.test');
  expect(out.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe('0'); // base.json 的 env key 保留
  expect(out.model).toBe('sonnet');
  expect(Object.keys(out).sort()).toEqual(['env', 'model']); // 不含 permissions/language 等
});

test('buildEnvSettings omits model key when profile has none', () => {
  // profiles/sonnet.json 只有 model:'sonnet' — 用一个无 model 的 profile 文件验证 out 无 model 键
});

test('buildEnvSettings throws for missing profile', () => {
  expect(() => buildEnvSettings(ccDir, 'nope')).toThrow('not found');
});
```

- [ ] **Step 2: 运行确认失败** — `npx jest env.test` → FAIL(模块不存在)
- [ ] **Step 3: 实现 `buildEnvSettings`** — 读 `${configDir}/base.json`、`${configDir}/profiles/${name}.json`(不存在时抛 Error,消息含 `not found`)、`${configDir}/private.json`;base/private 缺失时抛含 `Run \`cc-switch init\` first` 的 Error;调 `buildSettings`,从结果挑 `env` 和(若存在)`model`
- [ ] **Step 4: 运行确认通过** — `npx jest env.test` → PASS
- [ ] **Step 5: 提交** — `git add src/commands/env.js src/__tests__/env.test.js && git commit -m "feat: add buildEnvSettings for session env injection"`

---

### Task 2: claude 解析与 Windows 参数转义

**Files:**
- Modify: `src/commands/env.js`
- Test: `src/__tests__/env.test.js`(追加)

**Interfaces:**
- Consumes: 无(纯函数)
- Produces:
  - `resolveClaudeBin({ env, platform, spawnSyncFn }) -> string` — `env.CC_SWITCH_CLAUDE` 非空则返回之;非 win32 返回 `'claude'`;win32 用 `spawnSyncFn('where.exe', ['claude'])` 取 stdout 第一行,失败抛 `Error`(消息含 `CC_SWITCH_CLAUDE`)
  - `quoteCmdArg(arg: string) -> string` — cmd.exe 安全引号化
  - `buildSpawnInvocation(claudeBin, settingsFile, userArgs, platform) -> { command, args }` — 统一产出 spawn 参数:非 win32 为 `{ command: claudeBin, args: [claudeBin 后接 '--settings', settingsFile, ...userArgs] }`;win32 为 `{ command: ComSpec||cmd.exe, args: ['/d','/s','/c', join([claudeBin,'--settings',settingsFile,...userArgs].map(quoteCmdArg))] }`

- [ ] **Step 1: 写失败测试**

```js
test('resolveClaudeBin prefers CC_SWITCH_CLAUDE', () => { /* env 注入 → 返回该值 */ });
test('resolveClaudeBin returns claude on non-win32', () => { /* platform:'linux' */ });
test('resolveClaudeBin resolves via where.exe on win32', () => { /* fake spawnSyncFn 返回 {status:0, stdout:'C:\\...\\claude.cmd\r\n'} → 取第一行 */ });
test('resolveClaudeBin throws with hint when claude missing on win32', () => { /* fake spawnSyncFn 返回 {status:1} → /CC_SWITCH_CLAUDE/ */ });
test('quoteCmdArg passes plain args through', () => { expect(quoteCmdArg('abc')).toBe('abc'); });
test('quoteCmdArg quotes args with spaces', () => { expect(quoteCmdArg('hello world')).toBe('"hello world"'); });
test('quoteCmdArg escapes embedded quotes', () => { /* 'say "hi"' → "say \"hi\"" */ });
test('buildSpawnInvocation direct on linux', () => { /* command === bin, args[0] === '--settings' */ });
test('buildSpawnInvocation wraps via cmd.exe on win32', () => { /* args 含 '/d','/s','/c';拼接串含引号化的 settingsFile */ });
```

- [ ] **Step 2: 运行确认失败** — `npx jest env.test` → 新测试 FAIL
- [ ] **Step 3: 实现三个函数** — `quoteCmdArg`:参数含空白/引号/`&|<>^()` 时用双引号包裹、内部 `"` → `\"`、结尾 `\` 加倍;`resolveClaudeBin`/`buildSpawnInvocation` 按接口描述,默认参数取 `process.env`/`process.platform`/`child_process.spawnSync`
- [ ] **Step 4: 运行确认通过** — `npx jest env.test` → PASS
- [ ] **Step 5: 提交** — `git commit -m "feat: resolve claude binary and quote args for win32 spawn"`

---

### Task 3: `launch` 主流程 — 临时文件、spawn、清理、--print

**Files:**
- Modify: `src/commands/env.js`
- Test: `src/__tests__/env.test.js`(追加)

**Interfaces:**
- Consumes: Task 1 的 `buildEnvSettings`;Task 2 的 `resolveClaudeBin`、`buildSpawnInvocation`
- Produces:
  - `launch(profileName: string, userArgs: string[], opts: { configDir = getCCSwitchDir(), claudeBin?, spawnFn? }) -> Promise<number>`(退出码)— 校验 profile 存在(否则抛 Error,消息含可用 profile 列表)→ 写 `${os.tmpdir()}/cc-switch-env-${pid}-${random}.json`(Unix `chmod 600`)→ `console.error` 一行会话信息(含 profile 名与 model,**不含 token**)→ spawn(stdio inherit)→ close 后删临时文件、resolve 退出码 → spawn 'error' 事件时删文件、reject;`err.code === 'ENOENT'` 时包装为含 `claude not found ... set CC_SWITCH_CLAUDE` 提示的 Error;注册 `SIGINT`/`SIGTERM` handler(空函数,让子进程处理信号,避免父进程先退留下临时文件)
  - `run(profileName, userArgs, options)` — CLI 入口:`--print` 时调 `buildEnvSettings` 并 `console.log(JSON.stringify(result, null, 2))` 后返回;否则 `launch()` 后以退出码 `process.exit`;launch 抛错时 `console.error` 消息 + `process.exit(1)`

- [ ] **Step 1: 写失败测试**(fake spawnFn 返回 EventEmitter,手动 emit `'close'` with code;测试断言 spawn 收到的 command/args、临时文件在 close 后被删)

```js
test('launch spawns claude with --settings temp file and cleans up', async () => {
  // fake spawnFn: 记录 (command,args), 返回 emitter;稍后 emit('close', 0)
  // await launch('glm', ['-c'], { configDir: ccDir, claudeBin: 'claude', spawnFn })
  // 断言:记录的 args 含 '--settings' 与 .json 路径;该路径的文件在 resolve 后不存在;返回值 0
});
test('launch writes only env+model into temp file', async () => {
  // 在 fake spawnFn 内同步读取 --settings 路径的文件内容,解析后 keys 只含 env/model
});
test('launch passes nonzero exit code through', async () => { /* emit('close', 2) → 返回 2,文件已删 */ });
test('launch rejects and cleans up on spawn error', async () => { /* emit('error', new Error('ENOENT')) → rejects,文件已删 */ });
test('launch throws listing profiles for missing profile', async () => {
  // launch('nope', [], {...}) rejects / throws,消息含 'glm'(可用列表)且 tmpdir 无 cc-switch-env-* 新文件
});
test('launch throws init hint when base.json missing', async () => { /* configDir 无 base.json → 消息含 'init' */ });
test('launch prints session line without token', async () => {
  // spy console.error,断言输出含 'glm' 且不含 'sk-test'
});
```

- [ ] **Step 2: 运行确认失败** — `npx jest env.test` → 新测试 FAIL
- [ ] **Step 3: 实现 `launch` 与 `run`** — 按接口描述;临时文件名随机部分用 `crypto.randomUUID().slice(0,8)`;删除用 `fs.unlinkSync` try/catch(文件可能已不存在)
- [ ] **Step 4: 运行确认通过** — `npx jest env.test` → PASS;`npx jest` 全绿
- [ ] **Step 5: 提交** — `git commit -m "feat: launch claude with session settings via --settings temp file"`

---

### Task 4: CLI 注册、README、冒烟验证

**Files:**
- Modify: `bin/cli.js`(在 `local` 命令之后注册)
- Modify: `README.md`(Commands 表 + How It Works 一节)

**Interfaces:**
- Consumes: `run(profileName, userArgs, options)`(Task 3)

- [ ] **Step 1: 在 `bin/cli.js` 注册命令**

```js
program
  .command('env <profile> [args...]')
  .description('Start a one-off Claude Code session with this profile (no settings files modified)')
  .allowUnknownOption()
  .passThroughOptions()
  .option('--print', 'Print the injected settings JSON instead of launching')
  .action((profile, args, options) => require('../src/commands/env').run(profile, args || [], options));
```

- [ ] **Step 2: 冒烟验证**(不写自动化,人工核对输出)
  - `node bin/cli.js env glm --print` → 打印含 `env.ANTHROPIC_MODEL` 与 `model` 的 JSON,无 permissions
  - `node bin/cli.js env nope --print` → 错误 + 可用 profile 列表,exit 1
  - `node bin/cli.js env glm -- claude --version` → 打印 claude 版本后退出码 0,`%TEMP%` 无新增 `cc-switch-env-*` 文件
  - `node bin/cli.js env sonnet -- claude --version` 再跑一次,确认无遗留临时文件
  - 手动:真实 `cc-switch env glm` 交互会话中 Ctrl+C 退出后无遗留临时文件
- [ ] **Step 3: 更新 README** — Commands 表加 `cc-switch env <profile> [args...]` 行;How It Works 后加 "Session-level switching" 小节:说明机制(`claude --settings` 叠加层、仅 env+model、临时文件用后即删)、"unset = 直接运行 claude"、示例(两个终端并行用不同 profile)
- [ ] **Step 4: 全量测试** — `npx jest` → 全绿
- [ ] **Step 5: 提交** — `git commit -m "feat: register env command and document session-level switching"`

# `cc-switch local` 命令与安装时 profiles 同步设计

**日期：** 2026-08-15
**项目：** cc-switch — Claude Code 配置切换工具

---

## 背景

两个诉求：

1. 现有 `cc-switch use <profile> --local` 会把完整合并后的配置（base + profile + **private 里的 token**）写入当前项目的 `./.claude/settings.json`。该文件是 Claude Code 的**项目共享配置**，约定上会提交到 git，token 有泄露风险。Claude Code 的 `.claude/settings.local.json` 才是项目本地个人配置（约定上不提交，且优先级最高），应当写它。
2. 目前只有把 profiles 复制到 `~/.cc-switch/profiles` 的逻辑在交互式的 `cc-switch init` 里。开发时用 `yarn link` / `yarn install` 安装不会跑 init，仓库里 profiles 的更新（如新增内置 profile、修改现有 profile）无法传播到 `~/.cc-switch`。

---

## 目标

1. 新增 `cc-switch local <profile>` 命令，写 `./.claude/settings.local.json`，只对当前项目生效；`use --local` 的语义同步改为写 `settings.local.json`。
2. `package.json` 增加 `postinstall` 钩子：每次 `yarn install` / `npm install` / `npm install -g .` 时，把仓库内置 profiles 同步到 `~/.cc-switch/profiles`（总是覆盖内置 profile；不动用户自定义 profile）。

---

## 设计

### Part 1：`local` 命令与 `use --local` 语义变更

**`src/paths.js`**

`getLocalClaudeSettingsPath(cwd)` 返回值改为 `path.join(cwd, '.claude', 'settings.local.json')`。只换文件名，函数签名不变。

**`bin/cli.js`**

新增快捷命令，直接复用 `use.run`，不产生重复逻辑：

```js
program
  .command('local <profile>')
  .description('Activate a profile for the current project only (writes ./.claude/settings.local.json)')
  .action((profile) => require('../src/commands/use').run(profile, { local: true }));
```

`use --local` 选项描述改为 `'Write to ./.claude/settings.local.json (project-only, not committed)'`。

**`src/commands/use.js`**

合并（`buildSettings`）与写 settings 文件的逻辑不变。唯一调整：**`state.json` 的写入时机**。目前 `applyProfile` 无条件写全局 `state.json` 的 `activeProfile`，但 local 切换是项目级的——写进全局 state 后，在其他项目里跑 `cc-switch status` 会错误显示该 profile。改为：

- 写全局 `~/.claude/settings.json` 时：更新 `state.json`（现状不变）。
- 写 `./.claude/settings.local.json` 时：**不更新** `state.json`，只输出确认信息（`Switched to profile "x" (local)` + 文件路径）。

实现上给 `applyProfile` 增加第 4 个参数 `{ recordState = true }`，仅当 `recordState` 为真时写 `state.json`；`run` 在 local 时传 `{ recordState: !options.local }`（默认 true 向后兼容，且保持与现有测试相同的 applyProfile 层面可测试性）。

`status` 命令不变，仍是全局视图。

### Part 2：postinstall 同步 profiles

**新增 `src/sync-profiles.js`**（`init` 与 postinstall 共用的唯一一份同步逻辑）：

```js
function syncProfiles(targetDir) // targetDir = ~/.cc-switch
```

行为：

1. `mkdir -p <targetDir>/profiles`。
2. 读取仓库内置 profiles 列表（`<repo>/profiles/*.json`，即把 `init.js` 里的 `BUNDLED_PROFILES_DIR` / `getBundledProfiles` 移到本模块）。
3. 读取旧 `profiles.manifest.json`（不存在则为 `[]`）。
4. **清理过期内置 profile**：在旧 manifest 中、但不在新内置列表中的，从 `<targetDir>/profiles` 删除（处理内置 profile 改名/移除的情况）。用户自定义 profile 从不在 manifest 中，不受影响。
5. **复制全部内置 profile，总是覆盖**（保证仓库里的修改随安装传播）。
6. 重写 `profiles.manifest.json` 为新内置列表。

返回内置 profile 名称列表（供 postinstall 打印同步数量）。

**`src/commands/init.js`**

删除本地的 `BUNDLED_PROFILES_DIR` / `getBundledProfiles` 及 profiles 复制循环，`setupConfig` 改为调用 `syncProfiles(targetDir)`。`private.json` 写入（含 chmod 600）与 `base.json` 复制逻辑不变。

**新增 `scripts/postinstall.js`**（薄包装）：

```js
const { syncProfiles } = require('../src/sync-profiles');
const { getCCSwitchDir } = require('../src/paths');

try {
  const synced = syncProfiles(getCCSwitchDir());
  console.log(`cc-switch: synced ${synced.length} built-in profiles to ${getCCSwitchDir()}`);
} catch (err) {
  console.warn(`cc-switch: profile sync failed (${err.message}). Run \`cc-switch init\` to set up manually.`);
}
```

**绝不因同步失败导致安装失败**：捕获所有错误，只警告，退出码 0。

**`package.json`**

```json
"scripts": { "postinstall": "node scripts/postinstall.js" }
```

注意：postinstall 不同步 `base.json`（用户可通过 `edit --base` 自定义，覆盖会破坏用户配置）；也不碰 `private.json`（凭证仍由交互式 init 负责）。

---

## 错误处理

- **postinstall**：任何异常只警告、退出 0，不阻断 `yarn install` / `npm install`。
- **local 命令**：沿用 `use` 的现有校验（profile 不存在时报错并列出可用 profiles；缺少 `private.json` / `base.json` 时按现状抛错）。

---

## 测试（jest）

- **`src/__tests__/paths.test.js`**：更新 local 路径期望为 `settings.local.json`。
- **`src/__tests__/use.test.js`**：`--local` 写 `./.claude/settings.local.json`；local 运行**不写** `state.json`；全局运行仍写 `state.json`。
- **新增 `src/__tests__/sync-profiles.test.js`**：
  - 目标目录不存在时创建并复制全部内置 profiles + manifest；
  - 已存在的内置 profile 被仓库新版本覆盖；
  - 用户自定义 profile（不在 manifest 中）不受影响；
  - 旧 manifest 中有、新内置列表中没有的 profile 被删除；
  - manifest 被重写为新内置列表。
- **`src/__tests__/init.test.js`**：`setupConfig` 对外契约不变（private + base + profiles + manifest 都落盘），应无需修改，跑一遍确认。

---

## 影响范围

- `src/paths.js`：一行（文件名）。
- `bin/cli.js`：新增 `local` 命令、更新 `--local` 描述。
- `src/commands/use.js`：state 写入时机。
- `src/commands/init.js`：改为调用共享 sync 模块。
- 新增：`src/sync-profiles.js`、`scripts/postinstall.js`、`src/__tests__/sync-profiles.test.js`。
- `package.json`：postinstall 钩子。
- `README.md`：命令表（新增 `cc-switch local`、更新 `use --local`）、Features、兼容性说明。

---

## 兼容性

- **`use --local` 语义变更**：旧行为写 `./.claude/settings.json`，新行为写 `./.claude/settings.local.json`。旧行为有 token 泄露隐患，变更是有意的；README 中说明。此前已生成的 `./.claude/settings.json` 不做迁移/清理，用户自行删除即可。
- postinstall 覆盖内置 profile：内置 profile 本就是"受保护、由工具管理"的（`remove` 禁止删内置），覆盖语义与这一定位一致；用户自定义 profile 完全不受影响。
- 全局 `use`、`status`、`list`、`add`、`edit`、`remove` 行为不变。

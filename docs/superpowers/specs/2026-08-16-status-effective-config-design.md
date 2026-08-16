# `cc-switch status` 读取实际生效配置设计

**日期：** 2026-08-16
**项目：** cc-switch — Claude Code 配置切换工具

---

## 背景

`cc-switch status` 存在两个与实际状态脱节的问题：

1. **token/baseURL 显示可能错误**：`status` 永远显示 `private.json` 中的 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`（标注 `(from private)`）。但自 2026-06-26 的改动（profile env 可覆盖 private 值）后，自定义 profile 的 `env` 设置这两个变量时实际生效的是 profile 的值，status 显示与 Claude Code 实际读到的配置不一致。
2. **看不到项目本地配置**：`cc-switch local <profile>` 写入 `./.claude/settings.local.json` 且不更新全局 `state.json`。Claude Code 中 `settings.local.json` 优先级最高，存在该文件时实际生效的是它，而 status 只展示全局视图。

## 目标

1. `status` 优先读取项目本地 `./.claude/settings.local.json`；不存在时回退全局 `~/.claude/settings.json`。
2. `BASE_URL` / `AUTH_TOKEN`（以及 model 信息）一律从**实际生效的 settings 文件**读取，天然反映 profile 覆盖，不再直接读 `private.json`。

## 设计

### 1. 元数据写入 — `src/commands/use.js`

`applyProfile` 在 `buildSettings` 之后、写文件之前附加元数据：

```js
settings._ccSwitchProfile = profileName;
```

- 全局 `use` 与 `cc-switch local` / `use --local` 都写入。
- `recordState` 逻辑不变：全局仍写 `state.json`，作为 status 的兼容回退。
- `merge.js`、`base.json`、profiles 模板不动 —— 元数据是运行时附加，不进模板体系。
- Claude Code 忽略 settings 中的未知字段，该字段无副作用。

### 2. status 解析逻辑 — `src/commands/status.js`

新增解析函数 `resolveEffectiveView(localPath, globalPath, { activeProfile })`（路径通过参数传入，测试用临时目录 + 真实文件，与项目现有测试风格一致），`run()` 负责路径解析与 IO 编排：

解析顺序：

1. `./.claude/settings.local.json` 存在 → 读取，scope = `local`
2. 否则 `~/.claude/settings.json` 存在 → 读取，scope = `global`
3. 都不存在 → 输出 `No active settings found. Run 'cc-switch use <profile>' or 'cc-switch local <profile>'.`（退出码 0）

视图结构 `{ scope, sourcePath, profileName, model, anthropicModel, baseUrl, authToken }`：

- `profileName`：`settings._ccSwitchProfile`；缺失时 global scope 回退 `state.json` 的 `activeProfile`（兼容旧版写入的文件）；仍缺失显示 `(unknown)`
- `model`：生效文件顶层 `model` 字段
- `anthropicModel` / `baseUrl` / `authToken`：生效文件 `env.ANTHROPIC_MODEL` / `env.ANTHROPIC_BASE_URL` / `env.ANTHROPIC_AUTH_TOKEN`
- **status 不再读取 `private.json` 与 profile 文件**（`private.json not found` 报错路径随之移除）
- 生效文件 JSON 解析失败 → 报错退出（exit 1），提示文件路径损坏

### 3. 输出格式

```
Source         : ./.claude/settings.local.json (local)
Active profile : glm
Model (top)    : sonnet
ANTHROPIC_MODEL: glm-5.1        ← 仅当存在时显示
BASE_URL       : https://proxy.example.com
AUTH_TOKEN     : sk-my-***abcd (masked)
```

- `Source` 行替代原 `Target` 行，路径后带 `(local)` / `(global)` 标注
- 缺失值显示 `not set`；移除 `(from private)` 标注
- `maskToken` 保留现有实现（首 7 位 + `***` + 末 4 位，短 token 全遮蔽）

## 测试

- **`src/__tests__/status.test.js` 重写**：
  - `resolveEffectiveView`：local 存在时优先且不读 global；local 不存在回退 global；元数据缺失时 global 回退 `state.json`；local 元数据缺失显示 `(unknown)`；`env` 缺 token/baseURL 时为空；两个文件都不存在返回 null；JSON 损坏时报错
  - `formatStatus(view)`：新签名下的输出行、mask、`not set`、`ANTHROPIC_MODEL` 行的条件显示
  - `maskToken` 现有测试保留
- **`src/__tests__/use.test.js` 新增**：全局 `applyProfile` 与 `recordState: false`（local 路径）均写入 `_ccSwitchProfile`

## 影响范围

- `src/commands/use.js`：`applyProfile` 附加一行元数据写入
- `src/commands/status.js`：重写读取与展示逻辑（`resolveEffectiveView` + 新 `formatStatus` 签名）
- `src/__tests__/status.test.js`：重写
- `src/__tests__/use.test.js`：新增用例
- `README.md`：status 命令说明与输出示例更新

## 兼容性

- 旧版 cc-switch 写入的 settings 文件没有 `_ccSwitchProfile`：global scope 回退 `state.json`，行为与现状一致；local scope 显示 `(unknown)`，配置值照常从文件读取。
- `state.json` 继续由全局 `use` 维护，不做迁移或清理。
- 其余命令（`list` / `add` / `edit` / `remove` / `init`）与 `merge.js` 行为不变。

## 明确不做（YAGNI）

- 不修改 `merge.js` 与 base/profile 模板
- 不清理或迁移 `state.json`
- 不增加 `--all` 等多视图选项
- 不做 token/baseURL 来源推断标注

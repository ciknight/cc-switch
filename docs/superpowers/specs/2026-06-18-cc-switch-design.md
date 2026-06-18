# cc-switch 设计文档

**日期：** 2026-06-18  
**项目：** cc-switch — Claude Code 配置切换工具

---

## 概述

`cc-switch` 是一个跨平台（Windows / macOS / Linux）命令行工具，用于快速切换 Claude Code 的模型配置。通过 `npm install -g cc-switch` 安装为系统命令，支持全局和项目级配置切换。

核心思路：将 Claude Code 的 `settings.json` 拆分为三层——私密值（AUTH_TOKEN/BASE_URL）、基础模板（权限/插件/语言）、模型 profile（模型差异部分）——切换时合并写入目标文件。

---

## 目录结构

### 工具配置目录（`~/.cc-switch/`）

```
~/.cc-switch/
├── private.json              # 私密值（权限 600），不可出现在模板中
├── base.json                 # 基础模板（permissions, plugins, language 等）
├── state.json                # 记录当前全局激活的 profile 名
├── profiles.manifest.json    # 记录内置 profile 名称列表
└── profiles/
    ├── sonnet.json           # 预置 profile
    ├── glm.json              # 预置 profile
    └── opus.json             # 预置 profile
```

### 项目结构（npm 包）

```
cc-switch/
├── package.json          # name: "cc-switch", bin: { "cc-switch": "./bin/cli.js" }
├── bin/
│   └── cli.js            # 入口，解析命令
├── src/
│   ├── commands/
│   │   ├── init.js       # 初始化，引导输入私密值
│   │   ├── use.js        # 切换 profile
│   │   ├── list.js       # 列出所有 profile
│   │   ├── status.js     # 显示当前激活 profile
│   │   ├── add.js        # 新建 profile
│   │   ├── edit.js       # 编辑 profile / base / private
│   │   └── remove.js     # 删除 profile
│   ├── config.js         # 读写 ~/.cc-switch/ 目录
│   ├── merge.js          # 合并逻辑：base + profile + private
│   └── paths.js          # 跨平台路径解析
└── profiles/             # 随 npm 包发布的预置 profile
    ├── sonnet.json
    ├── glm.json
    └── opus.json
```

---

## 数据格式

### `private.json`

```json
{
  "ANTHROPIC_AUTH_TOKEN": "sk-ant-xxxxx",
  "ANTHROPIC_BASE_URL": "https://example.com/dist"
}
```

权限设置：Unix 系统 `chmod 600`，Windows 依赖用户目录 ACL 保护。

### `base.json`

```json
{
  "env": {
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
  },
  "permissions": {
    "allow": [
      "WebSearch", "WebFetch", "Read", "Bash", "Edit", "Write",
      "Skill", "PowerShell",
      "mcp__plugin_context7_context7__*",
      "mcp__plugin_playwright_playwright__browser_navigate",
      "Skill(code-review:code-review)",
      "Skill(code-review:code-review:*)"
    ],
    "defaultMode": "bypassPermissions"
  },
  "enabledPlugins": {
    "claude-md-management@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "commit-commands@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "superpowers@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "gopls-lsp@claude-plugins-official": true
  },
  "language": "Chinese",
  "effortLevel": "medium",
  "autoUpdatesChannel": "latest"
}
```

### `profiles/sonnet.json`（最简 profile）

```json
{
  "model": "sonnet"
}
```

### `profiles/glm.json`（含完整 env 覆盖）

```json
{
  "model": "sonnet",
  "env": {
    "ANTHROPIC_MODEL": "glm-5.1",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.1",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5.1",
    "CLAUDE_CODE_SUBAGENT_MODEL": "glm-5.1",
    "ANTHROPIC_SMALL_FAST_MODEL": "glm-5.1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

### `profiles/opus.json`

```json
{
  "model": "opus"
}
```

### `state.json`

```json
{
  "activeProfile": "glm"
}
```

只记录全局激活的 profile 名。`--local` 是单次操作标志，不持久化。

### `profiles.manifest.json`

```json
["sonnet", "glm", "opus"]
```

初始化时写入，记录内置 profile 名称列表，供 `list` 命令区分 `(built-in)` 与 `(custom)`。

---

## 合并逻辑

切换 profile 时，`merge.js` 按以下顺序深度合并：

1. 读取 `base.json`（基础结构）
2. 深度合并 `profiles/<name>.json`（模型差异覆盖 base）
3. 将 `private.json` 的值注入 `result.env.ANTHROPIC_AUTH_TOKEN` 和 `result.env.ANTHROPIC_BASE_URL`
4. 将结果写入目标 `settings.json`

**深度合并规则：** `env` 对象采用 key-level 合并（profile 的 env key 覆盖 base 的同名 key，不删除 base 中 profile 未提及的 key）。

---

## 命令接口

```
cc-switch init                    # 初始化：引导输入 AUTH_TOKEN 和 BASE_URL，创建 private.json
cc-switch use <profile>           # 切换全局 ~/.claude/settings.json
cc-switch use <profile> --local   # 切换当前项目 ./.claude/settings.json
cc-switch status                  # 显示当前激活的 profile 及关键配置信息
cc-switch list                    # 列出所有可用 profile（预置 + 自定义）
cc-switch add <name>              # 新建 profile（打开编辑器）
cc-switch edit <profile>          # 编辑指定 profile（打开编辑器）
cc-switch edit --base             # 编辑 base.json
cc-switch edit --private          # 编辑 private.json（修改 TOKEN/URL）
cc-switch remove <profile>        # 删除 profile（预置 profile 不可删除）
```

### 输出示例

**`cc-switch status`**
```
Active profile : glm
Target         : ~/.claude/settings.json
Model (top)    : sonnet
ANTHROPIC_MODEL: glm-5.1
BASE_URL       : https://example.com/dist (from private)
AUTH_TOKEN     : sk-ant-****** (masked)
```

**`cc-switch list`**
```
  sonnet   (built-in)
* glm      (built-in)  ← 当前激活
  opus     (built-in)
  my-test  (custom)
```

---

## 编辑器选择逻辑

`edit` 命令依次检查：
1. `$VISUAL` 环境变量
2. `$EDITOR` 环境变量
3. `code`（VS Code，三平台均可用）
4. `notepad`（Windows 兜底）/ `nano`（Unix 兜底）

---

## 跨平台路径

使用 `os.homedir()` 统一处理，无需平台分支。

| 平台 | `~/.claude/settings.json` |
|------|---------------------------|
| Windows | `C:\Users\<user>\.claude\settings.json` |
| macOS | `/Users/<user>/.claude/settings.json` |
| Linux | `/home/<user>/.claude/settings.json` |

---

## 安装方式

```bash
npm install -g cc-switch
cc-switch init
```

首次 `init` 时：
1. 检测 `~/.cc-switch/` 是否存在
2. 引导用户输入 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`
3. 创建 `private.json`（Unix 设置 600 权限）
4. 将预置 profiles 复制到 `~/.cc-switch/profiles/`
5. 将 `base.json` 模板复制到 `~/.cc-switch/base.json`
6. 提示运行 `cc-switch use sonnet` 开始使用

---

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| `private.json` 不存在 | 提示运行 `cc-switch init` |
| 指定 profile 不存在 | 列出可用 profile，退出码 1 |
| 目标 `settings.json` 目录不存在 | 自动创建目录 |
| `--local` 时非 git/项目目录 | 仍然创建 `.claude/settings.json`，给出提示 |
| 编辑器未找到 | 打印文件路径，提示用户手动编辑 |

---

## 依赖

- `commander` — CLI 参数解析
- `deep-merge`（或手写）— JSON 深度合并

不引入其他第三方依赖，保持轻量。

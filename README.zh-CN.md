# cc-switch

[![CI](https://github.com/ciknight/cc-switch/actions/workflows/ci.yml/badge.svg)](https://github.com/ciknight/cc-switch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](package.json)

**Claude Code 模型配置切换器** —— 一条命令在多个 API 端点、模型、密钥之间切换 Claude Code;可以按项目生效,也可以开一个不碰任何配置文件的一次性会话。

简体中文 | [English](README.md)

## 为什么需要它

让 Claude Code 跑在不同供应商上(Anthropic 官方、GLM 兼容网关、其他代理),意味着来回改 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN` 和一堆模型覆盖变量。手动做就是反复编辑 `settings.json` —— 又慢又容易错,而且 token 会留在可能被提交的文件里。

cc-switch 把这些配置拆成三层,替你合并:

```
base.json          # permissions、plugins、language —— 所有 profile 共享
  + profile.json   # 模型相关的 env 变量
  + private.json   # ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL(chmod 600,最后注入)
= settings.json
```

凭据永远不会出现在模板文件里,每次切换都只是一条命令。

## 功能

- 一条命令切换 Claude Code 的 `settings.json` 配置(`use` 全局、`local` 项目级)
- **会话级切换**(`env`):用任意 profile 启动一次性 Claude Code 会话 —— 不修改任何配置文件,多个终端可以同时跑不同供应商
- 新增、编辑、删除自定义 profile
- `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 始终私密 —— 从不进入模板
- 支持 Windows、macOS、Linux(CI 在三个平台上跑全部测试)

## 安装

```bash
npm install -g cc-switch
```

要求 Node.js >= 18。安装后初始化一次:

```bash
cc-switch init
```

`init` 会引导输入 `AUTH_TOKEN` 和 `BASE_URL`,存入 `~/.cc-switch/private.json`(Unix 下 chmod 600),并复制预置 profile。

## 快速上手

```bash
# 首次初始化:保存 API 凭据
cc-switch init

# 切换 profile(持久写入 ~/.claude/settings.json)
cc-switch use sonnet
cc-switch use glm

# 仅当前项目生效
cc-switch local opus

# 用某个 profile 开一个一次性会话(不改任何文件)
cc-switch env glm
cc-switch env glm -- -c

# 查看当前生效配置
cc-switch status

# 列出所有 profile
cc-switch list
```

## 命令

| 命令 | 说明 |
|---|---|
| `cc-switch init` | 初始化:保存 AUTH_TOKEN 和 BASE_URL,复制预置 profile |
| `cc-switch use <profile>` | 激活 profile(默认全局) |
| `cc-switch use <profile> --local` | 仅当前项目生效(写入 `./.claude/settings.local.json`,不进 git) |
| `cc-switch local <profile>` | `use <profile> --local` 的快捷方式 |
| `cc-switch env <profile> [args...]` | 用该 profile 启动一次性 Claude Code 会话 —— 不修改任何配置文件;profile 之后的参数透传给 `claude` |
| `cc-switch env --print <profile>` | 打印 `env` 将注入的 settings JSON(调试用) |
| `cc-switch list` | 列出所有可用 profile |
| `cc-switch status` | 显示实际生效的配置:优先读 `./.claude/settings.local.json`,其次 `~/.claude/settings.json`(TOKEN 打码) |
| `cc-switch add <name>` | 新建自定义 profile 并打开编辑器 |
| `cc-switch edit <profile>` | 编辑 profile |
| `cc-switch edit --base` | 编辑基础配置(permissions、plugins、language) |
| `cc-switch edit --private` | 编辑 private.json(AUTH_TOKEN / BASE_URL) |
| `cc-switch remove <profile>` | 删除自定义 profile(预置 profile 受保护) |

## 工作原理

切换 profile 时,三层合并写入 `~/.claude/settings.json`(或 `local` / `--local` 时的 `./.claude/settings.local.json`):

```
base.json          # permissions、plugins、language
  + profile.json   # 模型相关 env 变量
  + private.json   # ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL(最后注入)
= settings.json
```

`private.json` 里的凭据总是最后注入,从不出现在任何模板文件中。

`status` 始终显示 Claude Code 实际读取的内容:优先 `./.claude/settings.local.json`,其次全局文件;`BASE_URL` / `AUTH_TOKEN` 取自生效文件的 `env` —— 自定义 profile 覆盖这些值时也能正确反映。切换后的文件带有 `_ccSwitchProfile` 标记,`status` 据此显示当前 profile;Claude Code 会忽略它。

## 会话级切换

`use` 和 `local` 通过重写 `settings.json` 持久化一个 profile。`env` 是会话级替代方案:合并同样的三层,只保留 `env` 和 `model`,写入临时文件,然后以 `claude --settings <临时文件>` 启动 Claude Code —— 这是官方的单会话覆盖机制,优先级在你的用户/项目配置之上,且完全不碰它们。

```bash
# 终端 A
cc-switch env glm            # 用 glm 开一个交互会话

# 终端 B —— 同一台机器、同一时刻、不同 profile
cc-switch env gpt -- -c
```

- 不写入任何 `settings.json`;不更新 `state.json`,`status` 仍显示持久化的 profile
- 临时文件(包含你的 token)在 Claude Code 退出后删除;Unix 下存活期间为 `chmod 600`
- "unset" 就是不加前缀直接运行 `claude` —— 新开的终端自然回到全局配置
- `claude` 的退出码原样透传
- 如果 `claude` 不在 PATH,把 `CC_SWITCH_CLAUDE` 设为完整路径

为什么不用 `export ANTHROPIC_BASE_URL=...`?常规会话中 settings 文件的 `env` 块会覆盖 shell 导出的同名变量,纯 export 会输给之前 `use` 写入的配置。`--settings` 才是单会话场景下可靠的覆盖层。

> **注意:** v1.0 之前 `--local` 写的是 `./.claude/settings.json`(通常会被提交进 git)。
> 如果你用过,请删除该文件 —— 它包含你的 token —— 若已提交请从 git 历史中清除。

## 配置目录

`init` 之后,配置位于 `~/.cc-switch/`:

```
~/.cc-switch/
├── private.json              # 凭据(Unix 下 chmod 600)
├── base.json                 # 基础配置模板
├── state.json                # 当前激活的 profile 名
├── profiles.manifest.json    # 预置 profile 清单
└── profiles/
    ├── glm.json
    └── ...
```

预置 profile 在每次安装时由包内版本重新同步(`postinstall` 钩子):始终覆盖为捆绑版本,自定义 profile 永远不动。

## 添加自定义 profile

```bash
cc-switch add my-model
# 打开编辑器,带一个 profile 模板
```

profile 格式:

```json
{
  "model": "sonnet",
  "env": {
    "ANTHROPIC_MODEL": "my-custom-model"
  }
}
```

## 开发

```bash
git clone https://github.com/ciknight/cc-switch.git
cd cc-switch
npm ci
npm test          # 101 个测试
```

CI 在 Ubuntu、Windows、macOS 上以 Node 18 和 22 跑全部测试,覆盖每次 push 和 pull request:[Actions](https://github.com/ciknight/cc-switch/actions)。

## 许可证

[MIT](LICENSE) © ci_kn

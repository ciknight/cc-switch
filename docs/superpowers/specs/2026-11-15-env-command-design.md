# cc-switch env 命令设计文档

**日期:** 2026-11-15
**功能:** `cc-switch env` — 会话级 profile 启动器

---

## 意图

`use` 是持久切换(写 `settings.json`)。用户需要**会话级**的方式:多个终端并行,各自用不同的 URL / API key / model 启动 claude,互不干扰,不修改任何 settings 文件;"不注入"就自然回退到全局配置。

## 关键事实(文档调研结论)

1. **纯 export 不可靠**:常规会话中 settings 文件 `env` 块的值会覆盖 shell 导出的同名变量
   (code.claude.com/docs/en/env-vars.md#precedence)。而 cc-switch 的 `use` 已把
   `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 写进全局 settings.json 的 env,纯 export 注入会被它压掉。
2. **`claude --settings <file>`** 是官方的单会话覆盖机制:优先级在 user/project/local settings 之上
   (仅低于 managed),未列出的键保留文件值,`env` 块生效,不写任何文件。这是本功能的内核。

## 方案取舍

- **A. 包装启动器(选定)**:`cc-switch env <profile>` 合并配置后以 `claude --settings <临时文件>` 启动子进程。跨平台一致、无 shell 语法差异;"unset"天然成立——不加前缀、裸敲 `claude` 即全局。
- B. eval/函数代理注入(`eval "$(cc-switch env glm)"`):体验更接近 direnv,但需维护 bash + PowerShell 两套语法,PowerShell 的 `iex` 用法啰嗦。将来可作为 `--export` 选项叠加,内核与本方案完全复用。
- C. 纯 export:被事实 1 否决。

## 设计

### 命令接口

```
cc-switch env <profile>              # 以该 profile 配置启动交互式 claude
cc-switch env <profile> [args...]    # args 透传给 claude(如 cc-switch env glm -c)
cc-switch env <profile> --print      # 只打印将注入的 settings JSON,不启动(调试用)
```

- commander v12:`.allowUnknownOption()` + `.passThroughOptions()` 实现位置参数后的选项透传。
- 无 profile 参数 → 打印用法,exit 1。

### 注入内容

复用现有合并:`buildSettings(base, profile, private)`,但从结果中**只取 `env` 和 `model` 两个键**
写入临时 settings——不携带 permissions/plugins 等 base 内容,避免覆盖用户在全局 settings.json
里的手动修改;未包含的键在 `--settings` 叠加语义下保留原值。

### 临时文件生命周期

- 路径:`os.tmpdir()/cc-switch-env-<随机串>.json`;Unix 下权限 600(含 token)。
- 写入 → 启动 claude → **等待 claude 退出** → 删除文件。
- 异常路径(启动失败、SIGINT/SIGTERM)同样删除(process exit 钩子兜底)。
- 退出码透传 claude 的退出码。

### claude 可执行文件解析

优先级:`CC_SWITCH_CLAUDE` 环境变量 → PATH 中的 `claude`。
Windows 细节(实现重点):npm 全局安装是 `claude.cmd`(spawn 需经 cmd),原生安装是
`claude.exe`(可直接 spawn);含空格/引号的透传参数需做 Windows 引号转义。测试需覆盖带空格参数。

### 输出

启动前向 stderr 打一行会话信息,如 `session env: profile "glm" (model: glm-5.1)`;不打印 token。

### 非持久化

不写 `state.json`,`status` / `list` 行为不变(env 注入对其他会话不可见,属预期)。

### 错误处理

| 场景 | 处理 |
|---|---|
| profile 不存在 | 同 `use`:列出可用 profile,exit 1 |
| private.json / base.json 缺失 | 提示运行 `cc-switch init` |
| claude 未找到 | 报错,提示检查 PATH 或设置 `CC_SWITCH_CLAUDE` |
| spawn 失败 | 报错,删除临时文件,exit 1 |

## 非目标

- 不做任意环境变量管理(`cc-switch env set FOO=bar`)——shell 自身已能做
- 不做 direnv/eval 注入形态(方案 B,将来可选)
- 不做 `CLAUDE_CONFIG_DIR` 多账号隔离
- 不修改任何 settings 文件、不写 state.json

## 留给实现者

- Windows 参数转义与 `.cmd`/`.exe` 解析的具体实现与单测
- jest 中 mock `child_process.spawn` 的测试策略
- README 命令表与"session-level"说明的补充

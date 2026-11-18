# `cc-switch init-claude` 设计文档

**日期：** 2026-11-18
**功能：** 为当前项目初始化 `CLAUDE.md`（内置模板 + claude 交互式访谈）
**规模：** 中等改动 — 新增 1 个命令、2 个模板、1 组测试、README 更新

---

## 意图

新项目开始时，`CLAUDE.md` 往往要么缺失，要么写成大杂烩：语言、框架、架构、API、目录、流程全堆在一起，细节和原则混在一起，越写越长，最后没人维护。

需要一条可重复执行的命令：内置一份**高约束、低细节**的 `CLAUDE.md` 骨架，然后拉起 `claude` 做一次结构化访谈，把项目定位、技术栈、架构（默认 DDD）、Git workflow、API 形态（默认 REST，AI 能力用 MCP）、模块结构、文档分层、参考资料边界逐项问清楚，最后生成项目根目录的 `CLAUDE.md`。细节不写进 `CLAUDE.md`，而是落到 `docs/` 下并在 `CLAUDE.md` 里引用。

## 目标

1. 新增独立子命令 `cc-switch init-claude`，不改变现有 `cc-switch init` 的凭据/profile 初始化语义。
2. 命令可安全重复执行：默认不覆盖已有 `CLAUDE.md`，`--force` 才覆盖并留备份。
3. 生成的项目骨架包含：
   - `CLAUDE.md`（最高约束，只放关键信息）
   - `docs/spec/`、`docs/plan/`、`docs/guide/`、`docs/reference/`
4. 由 `claude` 以交互方式逐项提问，而不是 cc-switch 用固定问卷硬编码答案。
5. 访谈结束后，`claude` 直接改写项目根目录的 `CLAUDE.md`，并创建/更新需要展开的 `docs/` 文档。
6. 跨平台可用（Windows/macOS/Linux），复用 `env` 命令已有的 claude 定位与 Windows 引号处理。

## 非目标

- 不做全局模板管理（不安装到 `~/.cc-switch/templates/`），只支持 `--template <path>` 单次覆盖。
- 不做非交互式一键生成（`claude -p`）；关键约束必须经过用户确认。
- 不自动 `git init`、不自动提交、不修改 `.gitignore`。
- 不覆盖已有 `docs/` 文档内容（只补目录和缺失的骨架文件）。
- 不修改任何业务代码，不安装依赖，不访问网络。

## 方案取舍

- **A. 独立子命令 + 骨架 + 交互式 claude（选定）**
  cc-switch 负责确定性工作（目录、模板、启动、清理），claude 负责需要判断的访谈与落盘。职责清晰，可重复执行，失败时用户至少拿到骨架。
- B. cc-switch 用 `readline` 自己问固定问题，再渲染模板
  不依赖 claude，但无法追问、无法读取现有代码给出针对性建议，与用户"调用 claude + 模板提问"的要求不符。
- C. `claude -p "<超长提示词>"` 一次性生成
  无法交互提问，模型只能猜；关键约束（语言版本、DDD 边界、API 形态）最容易被编造。
- D. 并入现有 `cc-switch init`
  会让"已初始化"的判断同时覆盖凭据和 CLAUDE.md，语义和交互都变复杂；用户已选择 A。

## 命令接口

```text
cc-switch init-claude [dir]        # 默认当前目录
  --force                          # 覆盖已有 CLAUDE.md，先备份为 CLAUDE.md.bak
  --no-launch                      # 只生成骨架和 docs 目录，不启动 claude
  --template <path>                # 使用自定义 CLAUDE.md 骨架
```

- `dir` 不存在或不是目录 → 报错，exit 1。
- `CLAUDE.md` 已存在且未给 `--force` → 报错并提示 `--force`，exit 1。
- `--force` 覆盖前把原文件复制为 `CLAUDE.md.bak`；若该文件已存在，则改用带时间戳的 `CLAUDE.md.bak.YYYYMMDD-HHmmss`，绝不覆盖旧备份。
- 启动 claude 时的工作目录固定为 `dir`，退出码透传。

## 产物

```text
<project>/
├── CLAUDE.md                         # 由模板渲染，访谈后由 claude 改写
├── .claude/
│   └── cc-switch-init-claude.md      # 临时访谈提示词，claude 退出后删除
└── docs/
    ├── spec/.gitkeep
    ├── plan/.gitkeep
    ├── guide/.gitkeep
    └── reference/.gitkeep
```

- 目录和 `.gitkeep` 只在缺失时创建，幂等。
- 临时提示词放在项目内而不是系统临时目录：claude 读取时不需要越出工作目录，避免额外权限确认。
- `--no-launch` 不创建 `.claude/cc-switch-init-claude.md`。

## 生成流程

1. 解析参数，规范化 `dir`。
2. 冲突检查：`CLAUDE.md` 存在且无 `--force` 时退出。
3. `--force` 时备份旧 `CLAUDE.md`。
4. 创建 `docs/{spec,plan,guide,reference}` 与 `.gitkeep`。
5. 读取内置或 `--template` 骨架，替换占位符：
   - `{{PROJECT_NAME}}` → `path.basename(dir)`
   - `{{DATE}}` → `YYYY-MM-DD`
6. 写入 `CLAUDE.md`。
7. `--no-launch` → 打印后续提示并结束。
8. 写入 `.claude/cc-switch-init-claude.md`（访谈提示词）。
9. 解析 claude 可执行文件，`spawn` 交互式会话，初始消息（中文）：
   `请读取 .claude/cc-switch-init-claude.md 并按其说明执行。`
10. claude 退出后删除临时提示词，透传退出码。

## CLAUDE.md 模板

模板文件：`src/templates/claude-md/CLAUDE.template.md`。

设计原则：

- **项目信息在最上层**（第 1 节），先回答"这是什么、为谁做、不做什么"。
- 只写原则、边界和命令，不写实现细节；细节一律引用 `docs/` 路径。
- 明确"本文件是最高约束"，同时说明"细节以被引用文档为准"，避免两处冲突。
- 目标长度：生成后 80–150 行；超过 200 行视为需要拆分到 `docs/`。

章节结构：

1. **项目信息** — 一句话定位、目标用户、核心场景、当前阶段、非目标、成功标准。
2. **技术栈与语言约束** — 语言/最低版本、框架与版本、包管理器/构建命令、代码风格/格式化/静态检查、测试框架与门禁、禁止事项。
3. **架构模式** — 默认 DDD；接口层 → 应用层 → 领域层，基础设施层实现端口；聚合/实体/值对象/领域服务/仓储职责；跨模块通信；详细设计指向 `docs/spec/architecture.md`。
4. **API 与集成约定** — 普通 API 默认 RESTful（`/api/v1/<resource>`、错误格式、分页、幂等、鉴权）；AI 能力/工具集成优先 MCP（工具命名、schema、权限边界）；第三方 API 封装在基础设施层；契约指向 `docs/spec/api.md`。
5. **模块结构** — 目录树 + 模块职责 + 新增模块准入条件；目录树按 DDD 分层给出，并注明"按实际项目调整"。
6. **文档结构与关键路径** — `docs/spec|plan|guide|reference` 的用途表格和写作规则；关键入口 `docs/guide/overview.md`。
7. **参考资料与第三方边界** — 官方文档优先；第三方资料只作参考，引入前核对版本/许可证/维护状态；外部代码不得直接复制进领域层，先封装为基础设施适配器；参考记录放 `docs/reference/`。
8. **工作流与交付约束** — GitHub Flow：`main` 受保护；`feat/` `fix/` `docs/` `chore/` 分支；Conventional Commits；PR + 评审 + squash merge；提交前格式化/静态检查/测试门禁；一次变更只做一件事；不提交密钥；完成汇报格式。
9. **变更记录** — 结构性变更先改本文件，再改代码。

## 访谈提示词

模板文件：`src/templates/claude-md/init-prompt.md`。

cc-switch 把该文件复制为项目内临时文件后启动 claude。提示词要求 claude：

1. 先读取项目根目录的 `CLAUDE.md` 骨架和现有目录结构，再开始提问。
2. 一次只问一个问题；优先使用 `AskUserQuestion`，选项要具体；第一个问题是开放式的"这个项目是做什么的？"
3. 按顺序覆盖：项目信息 → 语言/框架/版本 → 架构（推荐 DDD，必须让用户确认分层与依赖方向）→ API（普通 API 推荐 REST，AI 相关推荐 MCP）→ 模块结构（基于现有目录提建议）→ 文档结构与关键路径 → 参考资料边界 → Git workflow 与工作流习惯。
4. 用户不确定的项写 `TODO`，不要编造；默认值必须显式确认，不能默默采用。
5. 用中文写作；删除 `CLAUDE.md` 中所有 `{{...}}` 占位符和"待补"标记。
6. 只保留关键约束；需要展开的内容写入 `docs/spec|plan|guide|reference` 对应文件，并在 `CLAUDE.md` 中用路径引用。
7. 不修改业务代码、不安装依赖、不执行与初始化无关的命令。
8. 结束时输出：已确定项、TODO 项、建议的下一步。

## 启动与清理

复用 `src/commands/env.js` 导出的：

- `resolveClaudeBin()` — `CC_SWITCH_CLAUDE` 优先，Windows 用 `where.exe`，其余平台用 `claude`。
- `quoteCmdArg()` — Windows cmd 引号转义。

`init-claude` 内实现一个轻量的 spawn 构造（不修改 `env` 的 `buildSpawnInvocation` 签名）：

- 非 Windows：`spawn(claudeBin, [initialMessage], { cwd, stdio: 'inherit' })`
- Windows：`spawn(cmd.exe, ['/d', '/s', '/c', [claudeBin, initialMessage].map(quoteCmdArg).join(' ')], { cwd, stdio: 'inherit' })`

初始消息使用中文。Windows 下命令经 `CreateProcessW` 以 UTF-16 传递，中文参数本身不会丢失；为覆盖 `.cmd` shim 的路径，`/c` 的命令串前追加 `chcp 65001>nul &`，让子会话按 UTF-8 处理输入输出。中文详细说明仍放在临时提示词文件里，由 claude 用 Read 工具读取。

清理策略与 `env` 一致：

- 子进程 `close` / `error` 时删除临时提示词。
- `process.on('exit')` 兜底删除。
- 第二次 `SIGINT` / `SIGTERM` 时强制清理并 exit 130；第一次交给前台 claude。

## 错误处理

| 场景 | 处理 |
|---|---|
| `dir` 不存在/不是目录 | 报错，exit 1 |
| `CLAUDE.md` 已存在且无 `--force` | 报错并提示 `--force`，exit 1 |
| `--template` 文件不存在 | 报错，exit 1 |
| 写文件/建目录失败 | 报错含路径，exit 1 |
| claude 未找到 | 同 `env`：提示检查 PATH 或设置 `CC_SWITCH_CLAUDE` |
| spawn 失败 | 删除临时提示词，报错，exit 1 |
| claude 非零退出 | 清理后透传退出码 |

## 测试

新增 `src/__tests__/init-claude.test.js`，沿用现有测试风格（临时目录 + 真实文件；`spawn` 用 mock）：

- `renderTemplate`：替换 `{{PROJECT_NAME}}` / `{{DATE}}`，不残留 `{{`。
- `scaffoldDocs`：创建四个目录和 `.gitkeep`；重复执行幂等。
- `prepareTarget`：无 `CLAUDE.md` 时写入骨架；已存在且无 `--force` 时抛错；`--force` 时生成 `.bak` 后覆盖。
- 模板内容：包含 9 个章节；"项目信息"是第一个二级标题；包含 DDD、REST、MCP、`docs/spec`、第三方边界、Git workflow 关键词。
- 访谈提示词：包含项目定位、语言/框架、DDD、REST、MCP、docs 路径、Git workflow 等必问项。
- `buildClaudeInvocation`：POSIX 返回 `command/args`；Windows 经 `cmd.exe` 且带空格参数被正确引号包裹。
- `launch`：mock `spawn`，断言 cwd、stdio、中文初始消息；`close` 后临时提示词被删除；返回 claude 退出码。
- `run`：`--no-launch` 不调用 spawn；`--template` 缺失时报错。

## 影响范围

- `bin/cli.js`：注册 `init-claude` 命令。
- `src/commands/init-claude.js`：新增。
- `src/templates/claude-md/CLAUDE.template.md`：新增。
- `src/templates/claude-md/init-prompt.md`：新增。
- `src/__tests__/init-claude.test.js`：新增。
- `README.md` / `README.zh-CN.md`：命令表与使用说明各加一段。
- `src/commands/env.js`：不修改；仅复用其导出函数。
- `package.json`：无需修改（`src/` 已在 `files` 中，模板随包发布）。

## 兼容性

- 现有 `init`、`use`、`local`、`env`、`list`、`status`、`add`、`edit`、`remove` 行为不变。
- 命令只写当前项目目录，不触碰 `~/.cc-switch/` 或 `~/.claude/`。
- 未安装 claude 时，`--no-launch` 仍可生成骨架。

## 留给实现者

- 模板文案的最终措辞与长度控制。
- Windows 下 `spawn` mock 与真实 cmd 转义的测试覆盖。
- README 中英文两版的命令示例。
- 是否需要额外的 `.claude/.gitignore` 处理（当前设计为退出即删除临时文件，不写入 `.gitignore`）。
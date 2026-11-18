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
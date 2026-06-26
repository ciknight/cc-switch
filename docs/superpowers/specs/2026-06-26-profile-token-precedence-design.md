# Profile 中自定义 token/baseURL 的优先级设计

**日期：** 2026-06-26  
**项目：** cc-switch — Claude Code 配置切换工具

---

## 背景

当前 `cc-switch use <profile>` 切换配置时，`src/merge.js` 的 `buildSettings` 会先把 `base.json` 和 profile 合并，然后**无条件**用 `private.json` 中的 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 覆盖最终结果。

这导致用户如果在自定义 profile 的 `env` 里写入了这两个变量（例如使用第三方 API 代理时），切换后仍然会被 `private.json` 的值覆盖，无法生效。

---

## 目标

允许 profile 中自定义的 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 优先于 `private.json` 中的值；仅当 profile 没有提供时，才使用 `private.json` 作为兜底。

---

## 设计

### 合并逻辑变更

修改 `src/merge.js` 中的 `buildSettings` 函数：

1. 先执行 `deepMerge(base, profile)`，得到合并后的配置。
2. 确保 `merged.env` 存在。
3. 对 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 分别判断：
   - 如果 `merged.env` 中已经存在该 key，则**保留 profile 的值**。
   - 如果不存在，则从 `priv` 注入该值。

保持 `deepMerge` 本身不变，保持通用性。

### 测试补充

在 `src/__tests__/merge.test.js` 中新增两个测试用例：

- `buildSettings 保留 profile 中已有的 ANTHROPIC_AUTH_TOKEN 和 ANTHROPIC_BASE_URL`：
  profile 中提供这两个变量，最终结果应等于 profile 的值，而不是 `private.json` 的值。

- `buildSettings 在 profile 缺少时仍从 private.json 注入`：
  profile 中不提供这两个变量，最终结果应使用 `private.json` 的值。

---

## 影响范围

- `src/merge.js`：`buildSettings` 函数内部逻辑。
- `src/__tests__/merge.test.js`：新增测试。

其它命令（`use`、`status`、`list` 等）不受影响。

---

## 兼容性

- 对于现有 built-in profile（`sonnet.json`、`glm.json` 等），它们的 `env` 中不包含这两个变量，行为不变，仍从 `private.json` 注入。
- 仅在用户主动在 profile 中加入这两个变量时，行为发生变化，符合预期。


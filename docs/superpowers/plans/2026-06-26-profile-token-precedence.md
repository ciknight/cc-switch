# Profile Token/BaseURL Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow profile-level `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` to take precedence over `private.json`, while still falling back to `private.json` when the profile does not provide them.

**Architecture:** Keep the generic `deepMerge` unchanged; add conditional injection logic inside `buildSettings` in `src/merge.js`. Add focused Jest tests in `src/__tests__/merge.test.js` to lock in both precedence and fallback behavior.

**Tech Stack:** Node.js 18+, Jest 29, CommonJS.

## Global Constraints

- Node.js version floor: `>=18.0.0`
- Test framework: Jest 29
- Code style: existing project uses `'use strict';`, 2-space indentation, single quotes
- Keep `deepMerge` generic; do not leak token-specific logic into it
- Only modify `src/merge.js` and `src/__tests__/merge.test.js`

---

### Task 1: Add failing tests for profile token/baseURL precedence

**Files:**
- Modify: `src/__tests__/merge.test.js`
- Test: `src/__tests__/merge.test.js`

**Interfaces:**
- Consumes: `buildSettings(base, profile, priv)` from `../merge`
- Produces: two new passing tests asserting precedence and fallback

- [ ] **Step 1: Append the two new test cases**

```javascript
test('buildSettings keeps profile ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL when present', () => {
  const base = { env: { ATTR: '0' } };
  const profile = {
    model: 'custom',
    env: {
      ANTHROPIC_AUTH_TOKEN: 'profile-token',
      ANTHROPIC_BASE_URL: 'https://profile.api',
    },
  };
  const priv = {
    ANTHROPIC_AUTH_TOKEN: 'private-token',
    ANTHROPIC_BASE_URL: 'https://private.api',
  };
  const result = buildSettings(base, profile, priv);
  expect(result.model).toBe('custom');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('profile-token');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://profile.api');
  expect(result.env.ATTR).toBe('0');
});

test('buildSettings falls back to private values when profile omits tokens', () => {
  const base = { env: { ATTR: '0' } };
  const profile = { model: 'sonnet' };
  const priv = {
    ANTHROPIC_AUTH_TOKEN: 'private-token',
    ANTHROPIC_BASE_URL: 'https://private.api',
  };
  const result = buildSettings(base, profile, priv);
  expect(result.model).toBe('sonnet');
  expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe('private-token');
  expect(result.env.ANTHROPIC_BASE_URL).toBe('https://private.api');
  expect(result.env.ATTR).toBe('0');
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:
```bash
npm test -- src/__tests__/merge.test.js
```

Expected: The two new tests fail because `buildSettings` currently overwrites the profile values unconditionally.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/__tests__/merge.test.js
git commit -m "test: add failing tests for profile token/baseURL precedence"
```

---

### Task 2: Implement conditional token/baseURL injection

**Files:**
- Modify: `src/merge.js:18-25`
- Test: `src/__tests__/merge.test.js`

**Interfaces:**
- Consumes: `deepMerge(base, profile)` and `priv.ANTHROPIC_AUTH_TOKEN` / `priv.ANTHROPIC_BASE_URL`
- Produces: `merged.env` where profile-provided values win and missing values fall back to `priv`

- [ ] **Step 1: Update `buildSettings` to conditionally inject private values**

Replace:

```javascript
function buildSettings(base, profile, priv) {
  const merged = deepMerge(base, profile);
  if (!merged.env) merged.env = {};
  merged.env.ANTHROPIC_AUTH_TOKEN = priv.ANTHROPIC_AUTH_TOKEN;
  merged.env.ANTHROPIC_BASE_URL = priv.ANTHROPIC_BASE_URL;
  return merged;
}
```

With:

```javascript
function buildSettings(base, profile, priv) {
  const merged = deepMerge(base, profile);
  if (!merged.env) merged.env = {};
  if (!('ANTHROPIC_AUTH_TOKEN' in merged.env)) {
    merged.env.ANTHROPIC_AUTH_TOKEN = priv.ANTHROPIC_AUTH_TOKEN;
  }
  if (!('ANTHROPIC_BASE_URL' in merged.env)) {
    merged.env.ANTHROPIC_BASE_URL = priv.ANTHROPIC_BASE_URL;
  }
  return merged;
}
```

- [ ] **Step 2: Run the full merge test suite**

Run:
```bash
npm test -- src/__tests__/merge.test.js
```

Expected: All tests pass, including the two new ones and all existing `deepMerge` and `buildSettings` tests.

- [ ] **Step 3: Run the full project test suite**

Run:
```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/merge.js
git commit -m "feat: let profile env override private auth token and base URL" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

1. **Spec coverage:**
   - Profile-provided `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` preserved → Task 2 Step 1 + Task 1 Step 1 first test.
   - Missing values fall back to `private.json` → Task 2 Step 1 + Task 1 Step 1 second test.
   - `deepMerge` unchanged → Task 2 Step 1 only touches `buildSettings`.

2. **Placeholder scan:**
   - No TBD/TODO placeholders.
   - All code blocks contain complete code.
   - Exact commands and expected outputs included.

3. **Type consistency:**
   - `buildSettings` signature remains `(base, profile, priv)`.
   - `priv.ANTHROPIC_AUTH_TOKEN` and `priv.ANTHROPIC_BASE_URL` used consistently with existing tests.

No issues found.

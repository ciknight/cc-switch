# cc-switch

[![CI](https://github.com/ciknight/cc-switch/actions/workflows/ci.yml/badge.svg)](https://github.com/ciknight/cc-switch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](package.json)

**Claude Code model profile switcher** — one command to switch Claude Code between API endpoints, models, and credentials; scope a profile to a project; or launch a one-off session without touching any settings file.

[简体中文](README.zh-CN.md) | English

## Why

Running Claude Code against different providers (Anthropic official, GLM-compatible gateways, other proxies) means juggling `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` and a handful of model-override env vars. Doing that by hand means editing `settings.json` — slow, error-prone, and your token ends up living in files you might commit.

cc-switch splits that configuration into three layers and merges them for you:

```
base.json          # permissions, plugins, language — shared by every profile
  + profile.json   # model-specific env vars
  + private.json   # ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (chmod 600, injected last)
= settings.json
```

Credentials never appear in templates, and every switch is a single command.

## Features

- Switch Claude Code's `settings.json` profile with a single command (`use`, project-scoped `local`)
- **Session-level switching** (`env`): start a one-off Claude Code session with any profile — no settings files modified, each terminal can run a different provider simultaneously
- Add, edit, and remove custom profiles
- Keeps `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` private — never in templates
- Works on Windows, macOS, and Linux (CI-tested on all three)

## Installation

Requires Node.js >= 18.

### From npm

```bash
npm install -g cc-switch
```

### From source (local install — no npm publish needed)

```bash
git clone https://github.com/ciknight/cc-switch.git
cd cc-switch
npm run setup        # Windows; one shot: deps + global `cc-switch` + init
make install         # macOS / Linux, same thing
```

Manual alternatives:

```bash
npm install -g .     # install this checkout as a global package (snapshot)
npm link             # dev mode: global command links here, code changes apply live
npm run teardown     # remove the global command (keeps ~/.cc-switch)
```

Install on an offline machine:

```bash
npm pack                          # produces cc-switch-1.0.0.tgz
npm install -g cc-switch-1.0.0.tgz
```

### Initialize once

```bash
cc-switch init
```

`init` prompts for your `AUTH_TOKEN` and `BASE_URL`, stores them in `~/.cc-switch/private.json` (chmod 600 on Unix), and copies the bundled profiles.

## Quick Start

```bash
# First-time setup: store your API credentials
cc-switch init

# Switch to a profile (persists to ~/.claude/settings.json)
cc-switch use sonnet
cc-switch use glm

# Switch for the current project only
cc-switch local opus

# One-off session with a profile (no files modified)
cc-switch env glm
cc-switch env glm -- -c

# See what's active
cc-switch status

# List all profiles
cc-switch list
```

## Commands

| Command | Description |
|---|---|
| `cc-switch init` | Initialize: store AUTH_TOKEN and BASE_URL, copy preset profiles |
| `cc-switch init-claude [dir]` | Scaffold a project `CLAUDE.md` + `docs/` directories, then run an interactive claude interview to fill it in |
| `cc-switch use <profile>` | Activate a profile (global by default) |
| `cc-switch use <profile> --local` | Activate for current project only (writes `./.claude/settings.local.json`, not committed to git) |
| `cc-switch local <profile>` | Shortcut for `use <profile> --local` |
| `cc-switch env <profile> [args...]` | Start a one-off Claude Code session with this profile — no settings files modified; args after the profile pass through to `claude` |
| `cc-switch env --print <profile>` | Print the settings JSON that `env` would inject (debugging) |
| `cc-switch list` | List all available profiles |
| `cc-switch status` | Show effective settings: reads `./.claude/settings.local.json` first, then `~/.claude/settings.json` (TOKEN masked) |
| `cc-switch add <name>` | Create a new custom profile and open it in an editor |
| `cc-switch edit <profile>` | Edit a profile |
| `cc-switch edit --base` | Edit base config (permissions, plugins, language) |
| `cc-switch edit --private` | Edit private.json (AUTH_TOKEN / BASE_URL) |
| `cc-switch remove <profile>` | Delete a custom profile (built-in profiles are protected) |

## Initializing a Project CLAUDE.md

```bash
cc-switch init-claude             # in the project root
cc-switch init-claude ../app      # or point at another directory
```

The command writes a `CLAUDE.md` skeleton and creates `docs/spec`, `docs/plan`,
`docs/guide`, and `docs/reference`, then starts an interactive Claude Code session
that interviews you about the project and fills in the file. `CLAUDE.md` is the
top-level constraint document; details live in `docs/` and are referenced by path.

| Option | Description |
|---|---|
| `--force` | Overwrite an existing `CLAUDE.md` (backs it up to `CLAUDE.md.bak`, or a timestamped `.bak.*` if that exists) |
| `--no-launch` | Write the skeleton and docs directories only; do not start claude |
| `--template <path>` | Use a custom `CLAUDE.md` template (its own section structure is kept) |

## How It Works

Switching a profile merges three layers into `~/.claude/settings.json` (or `./.claude/settings.local.json` with `local` / `--local`):

```
base.json          # permissions, plugins, language settings
  + profile.json   # model-specific env vars
  + private.json   # ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL (injected last)
= settings.json
```

Credentials in `private.json` are always injected last and never appear in any template file.

`status` always shows what Claude Code actually reads: it prefers `./.claude/settings.local.json`
over the global file, and takes `BASE_URL` / `AUTH_TOKEN` from the effective file's `env` — so a
custom profile overriding those values is reflected correctly. Switched files carry a
`_ccSwitchProfile` marker so `status` can name the active profile; Claude Code ignores it.

## Session-Level Switching

`use` and `local` persist a profile by rewriting a `settings.json`. `env` is the session-level
alternative: it merges the same three layers, keeps only `env` and `model`, writes them to a
temporary file, and starts Claude Code with `claude --settings <temp-file>` — the official
one-session override, applied above your user/project settings without touching them.

```bash
# Terminal A
cc-switch env glm            # interactive session on glm

# Terminal B — same machine, same moment, different profile
cc-switch env gpt -- -c
```

- Nothing is written to any `settings.json`; `state.json` is not updated, so `status` keeps
  reporting the persisted profile.
- The temp file (which contains your token) is deleted when Claude Code exits; on Unix it is
  `chmod 600` while it exists.
- "Unset" is simply running `claude` without the prefix — a fresh terminal is back on the
  global settings.
- Exit code of `claude` is passed through.
- If `claude` is not on PATH, set `CC_SWITCH_CLAUDE` to its full path.

Why not `export ANTHROPIC_BASE_URL=...`? A settings-file `env` block overrides same-named
shell variables in regular sessions, so plain exports lose to whatever `use` wrote earlier.
`--settings` is the layer that reliably wins for one session.

> **Note:** Before v1.0, `--local` wrote `./.claude/settings.json` (which is usually committed to git).
> If you used it, delete that file — it contains your token — and remove it from git history if committed.

## Configuration Directory

After `init`, your config lives at `~/.cc-switch/`:

```
~/.cc-switch/
├── private.json              # credentials (chmod 600 on Unix)
├── base.json                 # base settings template
├── state.json                # active profile name
├── profiles.manifest.json    # built-in profile list
└── profiles/
    ├── glm.json
    └── ...
```

Built-in profiles are re-synced from the package on every install (`postinstall` hook):
they are always overwritten with the bundled versions, custom profiles are never touched.

## Adding a Custom Profile

```bash
cc-switch add my-model
# opens editor with a stub profile
```

Profile format:

```json
{
  "model": "sonnet",
  "env": {
    "ANTHROPIC_MODEL": "my-custom-model"
  }
}
```

## Development

```bash
git clone https://github.com/ciknight/cc-switch.git
cd cc-switch
npm ci
npm test          # 129 tests
```

CI runs the full suite on Ubuntu, Windows, and macOS against Node 18 and 22 on every push and
pull request: [Actions](https://github.com/ciknight/cc-switch/actions).

## License

[MIT](LICENSE) © ci_kn

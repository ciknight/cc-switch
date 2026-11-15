# cc-switch

Claude Code model profile switcher — switch between model configurations instantly via CLI.

## Features

- Switch Claude Code's `settings.json` profile with a single command
- Built-in profiles: `sonnet`, `opus`, `glm` (GLM-5.x compatible)
- Global (`~/.claude/settings.json`) and per-project (`./.claude/settings.local.json`) switching
- Keeps `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` private — never in templates
- Add, edit, and remove custom profiles
- Works on Windows, macOS, and Linux

## Installation

```bash
npm install -g cc-switch
```

Requires Node.js >= 18.

## Quick Start

```bash
# First-time setup: store your API credentials
cc-switch init

# Switch to a profile
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
| `cc-switch use <profile>` | Activate a profile (global by default) |
| `cc-switch use <profile> --local` | Activate for current project only (writes `./.claude/settings.local.json`, not committed to git) |
| `cc-switch local <profile>` | Shortcut for `use <profile> --local` |
| `cc-switch env <profile> [args...]` | Start a one-off Claude Code session with this profile — no settings files modified; args after the profile pass through to `claude` |
| `cc-switch env --print <profile>` | Print the settings JSON that `env` would inject (debugging) |
| `cc-switch list` | List all available profiles |
| `cc-switch status` | Show effective settings: reads `./.claude/settings.local.json` first, falls back to `~/.claude/settings.json` (TOKEN masked) |
| `cc-switch add <name>` | Create a new custom profile and open it in an editor |
| `cc-switch edit <profile>` | Edit a profile |
| `cc-switch edit --base` | Edit base config (permissions, plugins, language) |
| `cc-switch edit --private` | Edit private.json (AUTH_TOKEN / BASE_URL) |
| `cc-switch remove <profile>` | Delete a custom profile (built-in profiles are protected) |

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

> **Note:** Before v1.0, `--local` wrote `./.claude/settings.json` (which is usually committed to git).
> If you used it, delete that file — it contains your token — and remove it from git history if committed.

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

## Configuration Directory

After `init`, your config lives at `~/.cc-switch/`:

```
~/.cc-switch/
├── private.json              # credentials (chmod 600 on Unix)
├── base.json                 # base settings template
├── state.json                # active profile name
├── profiles.manifest.json    # built-in profile list
└── profiles/
    ├── sonnet.json
    ├── opus.json
    └── glm.json
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

## Built-in Profiles

| Profile | Description |
|---|---|
| `sonnet` | Claude Sonnet |
| `opus` | Claude Opus |
| `glm` | Routes all model slots to `glm-5.1` via env vars |

## License

MIT

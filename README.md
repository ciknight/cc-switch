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
| `cc-switch list` | List all available profiles |
| `cc-switch status` | Show active profile and key settings (TOKEN masked) |
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

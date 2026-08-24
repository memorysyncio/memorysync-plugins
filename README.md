# MemorySync agent plugins — source of truth

This folder is the development home of the MemorySync plugins for
**Claude Code / Claude Cowork**, **Cursor**, **OpenAI Codex**, the
**Devin CLI** (formerly Windsurf), and **Google Antigravity** — one
plugin package (`plugins/memorysync/`) with per-platform manifests, all
sharing the same dependency-free Node hook scripts, skills and the
MemorySync MCP servers.

## Layout

```
sdk/agent-plugins/
├── .claude-plugin/marketplace.json   ← Claude Code marketplace catalog
├── .cursor-plugin/marketplace.json   ← Cursor team-marketplace catalog
├── .codex-plugin/marketplace.json    ← Codex marketplace catalog
├── marketplace.json                  ← Codex root catalog (CLI reads this)
├── plugins/memorysync/               ← THE PLUGIN (see its README)
│   ├── .claude-plugin/ .cursor-plugin/ .codex-plugin/   ← manifests
│   ├── .mcp.json .cursor-mcp.json .codex-mcp.json       ← MCP per platform
│   ├── hooks/hooks.json cursor-hooks.json codex-hooks.json
│   ├── rules/memorysync.mdc          ← Cursor recall rule (hooks can't inject there)
│   ├── scripts/                      ← shared Node >=18 hook scripts
│   └── skills/                       ← memory / status / remember / recall
├── examples/cowork-settings.json     ← repo settings for teams + Cowork
├── examples/devin/                   ← Devin CLI hooks.v1.json + always-on rule
├── antigravity/                      ← Google Antigravity plugin bundle (degit-installable)
├── skills/building-with-memorysync/  ← the BUILDER skill (canonical copy)
├── building-with-memorysync/         ← builder plugin: skill copy + docs-MCP (.mcp.json)
└── tests/                            ← contract suites + live runbook
```

## Test

```
node --test tests/hooks.test.mjs tests/platform-hooks.test.mjs tests/builder-skill.test.mjs
claude plugin validate plugins/memorysync --strict
claude plugin validate building-with-memorysync --strict
claude plugin validate . --strict
tests/live-local.md                     # model-visible verification runbook
```

## Release flow (public distribution)

Distribution happens from the dedicated PUBLIC repo
**`memorysyncio/memorysync-plugins`** (renamed from `memorysync-claude` —
GitHub redirects the old name, so existing Claude installs keep
updating). Its content is exactly this folder minus `tests/`:

1. Bump `version` in every manifest that carries one (Claude plugin +
   marketplace entry, Cursor plugin + marketplace entry, Codex plugin) —
   they must agree; `claude plugin tag plugins/memorysync` checks the
   Claude pair.
2. Copy `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`,
   `marketplace.json`, `plugins/`, `examples/` and this README to the
   public repo checkout; commit and push to `main`.
3. Installs:
   - Claude Code: `/plugin marketplace add memorysyncio/memorysync-plugins`
     → `/plugin install memorysync@memorysync`
   - Cursor: team marketplace import of the repo, or local
     `~/.cursor/plugins/local/memorysync`; official listing via
     cursor.com/marketplace/publish (manual review)
   - Codex: `codex plugin marketplace add memorysyncio/memorysync-plugins`
     → `codex plugin add memorysync@memorysync`
   - Devin CLI: copy `examples/devin/hooks.v1.json` to
     `~/.config/devin/hooks.v1.json` (or a repo's `.devin/`), point the
     paths at a checkout of `plugins/memorysync/scripts/`; the scripts
     run under the `devin` platform argument. Rules file:
     `examples/devin/rules/memorysync.md` → `.devin/rules/`. MCP:
     `npx memorysync-mcp-install --client devin-desktop`. Devin's
     closed-beta plugin system loads Claude-format plugins, so
     `devin plugins install memorysyncio/memorysync-plugins` is expected to
     work as access opens up.
   - Google Antigravity: the `antigravity/` folder is a complete plugin
     bundle (plugin.json + mcp_config.json + hooks.json + skills +
     rule + script copies). Install:
     `npx degit memorysyncio/memorysync-plugins/antigravity ~/.gemini/config/plugins/memorysync`.
     The bundle's `scripts/` are byte-copies of `plugins/memorysync/scripts/`
     — a CI test enforces they never drift.

Enterprise note: Anthropic's Claude-org GitHub marketplace sync rejects
public repos — enterprises fork this repo privately and register the
fork via `extraKnownMarketplaces`.

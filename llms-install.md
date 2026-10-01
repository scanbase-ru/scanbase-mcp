# Installing scanbase-mcp (guide for AI agents)

scanbase-mcp is an MCP server that checks live websites for compliance with the Russian personal data law 152-FZ. It is published on npm and runs via `npx` — no cloning or building required.

## Prerequisites

- Node.js ≥ 18 (check with `node --version`).
- A ScanBase API key in the format `sb_live_…`. The key is free: the user signs in by email at https://scanbase.ru/cabinet/ and creates one under **Аккаунт → API-доступ → «Создать бесплатный ключ»**. If the user does not have a key yet, ask them to get one there — do not invent or reuse keys.

## Install (any MCP client)

Add this to the client's MCP servers configuration:

```json
{
  "mcpServers": {
    "scanbase": {
      "command": "npx",
      "args": ["-y", "scanbase-mcp"],
      "env": { "SCANBASE_API_KEY": "sb_live_USER_KEY_HERE" }
    }
  }
}
```

Replace `sb_live_USER_KEY_HERE` with the user's actual key. The key is a secret — store it only in the MCP config, never commit it to the repository.

Client-specific notes:
- **Cline / Cursor / Windsurf / Claude Desktop**: use the JSON block above in the client's MCP settings file.
- **Claude Code**: `claude mcp add scanbase -e SCANBASE_API_KEY=sb_live_USER_KEY_HERE -- npx -y scanbase-mcp`
- **Cursor one-click**: https://scanbase.ru/cursor/ generates an install deeplink in the browser.

No other environment variables are required. `SCANBASE_API_BASE` exists only for testing and should be left unset.

## Verify the installation

1. The server should start and expose 5 tools: `scan_site`, `list_checks`, `get_scan`, `list_scans`, `account`.
2. Call `account` — it should return the account email, tier and remaining quota. If it returns an authentication error, the API key is wrong or missing.
3. Optionally call `list_checks` (free, spends no quota) — it should list ~45 compliance checks.

## Usage notes

- `scan_site` scans a **publicly reachable** website (not localhost). A heavy site can take a few minutes; the tool waits by default.
- The free tier allows 5 scans per day. On quota errors, suggest the user check `account` or visit https://scanbase.ru/cabinet/.
- Typical workflow: `list_checks` before writing site code → deploy → `scan_site` → apply the returned fix instructions as code changes → `scan_site` again to verify.

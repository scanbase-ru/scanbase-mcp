# scanbase-mcp

[![npm](https://img.shields.io/npm/v/scanbase-mcp)](https://www.npmjs.com/package/scanbase-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-ru.scanbase%2Fscanbase-8b5cf6)](https://registry.modelcontextprotocol.io/v0.1/servers?search=ru.scanbase)

MCP server for **ScanBase** — a compliance scanner that checks live websites against the Russian personal data law **152-FZ** and related regulations. Gives AI agents (Cursor, Claude Code, Claude Desktop, VS Code, Windsurf, Cline) a real website-compliance tool: scan → get violations with fines → apply machine-actionable fix instructions → rescan.

A thin wrapper over the public `scanbase-api/v1` HTTP API — all scanning, gating and quota logic lives on scanbase.ru. [Русская версия ниже.](#русская-версия)

## Tools

| Tool | What it does |
|---|---|
| `scan_site(url, wait?)` | Scans a live website → compliance score 0–100, violations with potential fines (rubles), machine-actionable fix instructions the agent can apply as code changes, document/cookie/tracker analysis. Waits for slow sites with `wait=true`. |
| `list_checks()` | Catalog of all ~45 checks: law article, max fine. Call BEFORE writing site code to build it compliant from the start. Spends no quota. |
| `get_scan(scan_id)` | Re-read a saved scan result without spending a new scan. |
| `list_scans(page?, per_page?)` | Account scan history: past scan_ids, score dynamics. |
| `account()` | Tier, subscription, remaining quota. |

Recommended loop: `list_checks` before coding → deploy → `scan_site` → apply the fix instructions → `scan_site` again.

## Install

Requires Node ≥ 18 and a ScanBase API key (`sb_live_…`) — get a free one at [scanbase.ru/cabinet](https://scanbase.ru/cabinet/) (Account → API access). One-click Cursor install: [scanbase.ru/cursor](https://scanbase.ru/cursor/).

```json
{
  "mcpServers": {
    "scanbase": {
      "command": "npx",
      "args": ["-y", "scanbase-mcp"],
      "env": { "SCANBASE_API_KEY": "sb_live_YOUR_KEY" }
    }
  }
}
```

Claude Code: `claude mcp add scanbase -e SCANBASE_API_KEY=sb_live_YOUR_KEY -- npx -y scanbase-mcp`

## Configuration (env)

| Variable | Purpose |
|---|---|
| `SCANBASE_API_KEY` | Your `sb_live_…` key (required). |
| `SCANBASE_API_BASE` | API base URL. Default `https://scanbase.ru/wp-json/scanbase-api/v1`. |

## Pricing

The tier is determined by your key's account. Free: 5 scans/day, condensed report. Scan packages and subscription unlock the full report. Docs: [scanbase.ru/api](https://scanbase.ru/api/) · [scanbase.ru/developers](https://scanbase.ru/developers/).

---

## Русская версия

MCP-сервер для **ScanBase** — сканера сайтов на соответствие **152-ФЗ** (персональные данные) и смежным законам РФ. Даёт AI-агентам (Cursor, Claude Code, Claude Desktop и др.) инструмент проверки сайтов на юридическое соответствие прямо из редактора: скан → нарушения со штрафами → машиночитаемые «как исправить» → рескан.

### Инструменты

| Инструмент | Что делает |
|---|---|
| `scan_site(url, wait?)` | Сканирует живой сайт → оценка 0–100, нарушения со штрафами, инструкции «как исправить» (агент применяет их как правки кода), анализ документов/cookie/трекеров. |
| `list_checks()` | Справочник всех проверок (~45): статья закона, максимальный штраф. Вызывайте ДО написания кода. Не тратит квоту. |
| `get_scan(scan_id)` | Сохранённый результат по id — перечитать находки, не тратя новый скан. |
| `list_scans(page?, per_page?)` | История сканов аккаунта: прошлые scan_id, динамика балла. |
| `account()` | Тариф, подписка, остаток квоты. |

Рекомендуемый цикл: `list_checks` до кода → деплой → `scan_site` → применить «как исправить» → `scan_site` повторно.

### Установка

Нужен Node ≥ 18 и API-ключ ScanBase (`sb_live_…`) — бесплатный в [личном кабинете](https://scanbase.ru/cabinet/) (Аккаунт → API-доступ). Подключение к Cursor в один клик: [scanbase.ru/cursor](https://scanbase.ru/cursor/). Конфиг MCP — как в английской секции выше.

### Пример

> «Проверь https://example.ru на соответствие 152-ФЗ»

Агент вызовет `scan_site` и вернёт оценку, список нарушений и суммы штрафов.

### Тарифы

Тариф определяется вашим ключом (аккаунтом). Free — 5 сканов/сутки, сокращённый отчёт; пакеты сканов и подписка открывают полный. Документация: [scanbase.ru/api](https://scanbase.ru/api/) · [scanbase.ru/developers](https://scanbase.ru/developers/).

---

© ScanBase (scanbase.ru) · MIT License

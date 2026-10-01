#!/usr/bin/env node
/**
 * ScanBase MCP server — тонкая обёртка над Public API v1 (scanbase-api/v1).
 * Даёт AI-агентам инструменты проверки сайтов на соответствие 152-ФЗ и смежным законам РФ.
 * Вся логика (скан, гейтинг, квоты) — на стороне API scanbase.ru; здесь только перевод MCP↔HTTP.
 *
 * Конфиг (env):
 *   SCANBASE_API_KEY   — ключ sb_live_… (обязателен)
 *   SCANBASE_API_BASE  — базовый URL API (по умолчанию https://scanbase.ru/wp-json/scanbase-api/v1)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.SCANBASE_API_BASE || "https://scanbase.ru/wp-json/scanbase-api/v1").replace(/\/+$/, "");
const KEY = process.env.SCANBASE_API_KEY || "";

type ApiResp = { status: number; json: any };

async function api(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<ApiResp> {
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    // AbortSignal.timeout — жёсткий предел на КАЖДЫЙ fetch, чтобы отдельный запрос не завис дольше бюджета poll (Codex).
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? `таймаут запроса (${timeoutMs} мс)` : String(e?.message || e);
    return { status: 0, json: { error: { code: "network", message: msg } } };
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* пустое/не-JSON тело */ }
  return { status: res.status, json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function text(t: string, isError = false) {
  return { content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) };
}

/** Ошибка API → человекочитаемо. */
function apiError(r: ApiResp): string {
  if (r.status === 0) return `Сеть недоступна: ${r.json?.error?.message || "connection failed"}`;
  if (r.status === 401) return "Неверный или отозванный API-ключ (SCANBASE_API_KEY).";
  if (r.status === 404) return r.json?.error?.message || "Не найдено.";
  if (r.status === 429) return `Превышена квота/лимит: ${r.json?.error?.message || "rate limited"}. Остаток и время сброса — инструмент account; докупить сканы — https://scanbase.ru/cabinet/ .`;
  if (r.status === 503) return "Сканер временно недоступен, попробуйте позже.";
  return `Ошибка API (HTTP ${r.status}): ${r.json?.error?.message || "неизвестно"}.`;
}

/** Краткая сводка scan_result для агента + полный JSON. */
function scanResult(d: any) {
  const score = d?.score ?? "—";
  const vc = d?.summary?.violations_count ?? "?";
  const fine = Number(d?.summary?.total_fine_max ?? 0);
  const lines: string[] = [
    `ScanBase · 152-ФЗ · ${d?.url || ""}`,
    `Оценка соответствия: ${score}/100 · нарушений: ${vc} · макс. штраф: ${fine.toLocaleString("ru-RU")} ₽ · тариф: ${d?.tier || "?"}`,
  ];
  const checks: any[] = Array.isArray(d?.all_checks) ? d.all_checks : [];
  const viol = checks.filter((c) => c && c.passed === false && !c.warning).slice(0, 8);
  if (viol.length) {
    lines.push("", "Ключевые нарушения:");
    for (const c of viol) lines.push(`  • ${c.name || c.id}${c.fine ? ` — до ${Number(c.fine).toLocaleString("ru-RU")} ₽` : ""}`);
  }
  // v1.1: машиночитаемые инструкции «как исправить» — поднимаем из JSON в сводку, агент исполняет их напрямую.
  const fixes = checks.filter((c) => c && c.passed === false && c.fix).slice(0, 8);
  if (fixes.length) {
    lines.push("", "Как исправить (выполните эти правки в коде сайта, затем повторите scan_site):");
    for (const c of fixes) lines.push(`  • [${c.id}] ${c.fix}`);
  }
  const warns = checks.filter((c) => c && c.warning === true).length;
  if (warns) lines.push("", `Проверить вручную: ${warns} пункт(ов) — автоматика не смогла подтвердить (см. warning:true в JSON).`);
  if (d?.tier === "free") lines.push("", "(free-тариф: детали части проверок и несоответствия документов скрыты — полный отчёт открывается пакетом сканов или подпиской в кабинете https://scanbase.ru/cabinet/ .)");
  return text(lines.join("\n") + "\n\n```json\n" + JSON.stringify(d, null, 2) + "\n```");
}

const server = new McpServer(
  { name: "scanbase", version: "1.1.0" },
  {
    instructions: [
      "ScanBase checks live websites for compliance with Russian personal data law (152-FZ) and related regulations.",
      "Use these tools whenever the user is building, reviewing or preparing to launch a website intended for users in Russia,",
      "or asks about 152-ФЗ, персональные данные, privacy policy, обработка данных, согласие, cookies, трекеры, Роскомнадзор / Roskomnadzor.",
      "",
      "Recommended workflow:",
      "1. Before writing code: call list_checks to learn what will be verified, and build the site accordingly.",
      "2. After deploying (the site must be publicly reachable): call scan_site with the site URL.",
      "3. Apply the returned 'Как исправить' instructions and dev_tasks as code changes (cookie banner, policy links, consent checkboxes, etc.).",
      "4. Re-run scan_site to verify. Remaining legal items (documents, РКН registration) — direct the user to https://scanbase.ru/cabinet/ .",
      "",
      "Free tier: 5 scans/day, condensed report (some details locked). Paid packages/subscription unlock full findings — purchased by the user at scanbase.ru, never through these tools.",
    ].join("\n"),
  }
);

server.tool(
  "scan_site",
  "Scan a LIVE website for compliance with the Russian personal data law 152-FZ and related laws (ads 38-FZ, recommender systems 408-FZ, education 273-FZ, medicine 323-FZ). Use when the user is launching/reviewing a site for the Russian market or asks about 152-ФЗ, персональные данные, privacy, cookies, согласие, Роскомнадзор. Returns a 0–100 compliance score, violations with potential fines (rubles), machine-actionable fix instructions to apply as code changes, and document/cookie/tracker analysis. The site must be publicly reachable (not localhost). After applying fixes, call scan_site again to verify. // Проверка живого сайта на 152-ФЗ: балл, нарушения со штрафами, инструкции «как исправить» для правок кода.",
  {
    url: z.string().describe("Полный URL сайта, напр. https://example.ru/"),
    wait: z.boolean().optional().describe("Дождаться результата для тяжёлого сайта (по умолчанию true). Если false — вернёт статус pending, результат позже через list_scans/get_scan."),
  },
  async ({ url, wait }: { url: string; wait?: boolean }) => {
    if (!KEY) return text("SCANBASE_API_KEY не задан. Получите ключ у ScanBase и задайте переменную окружения SCANBASE_API_KEY.", true);
    const doWait = wait !== false;
    const r = await api("POST", "/scans", { url }, 150000); // sync-окно API ~120с + запас
    if (r.status === 200) return scanResult(r.json);
    if (r.status === 202) {
      if (!doWait) return text(`Скан запущен (тяжёлый сайт). Результат появится позже — вызовите get_scan/list_scans или scan_site с wait=true.\nurl: ${url}`);
      const deadline = Date.now() + 5 * 60 * 1000; // добор ≤5 мин поверх ожидания POST
      while (Date.now() < deadline) {
        await sleep(15000);
        const p = await api("GET", `/scans/pending?url=${encodeURIComponent(url)}`);
        if (p.status === 200) return scanResult(p.json);
        if (p.status === 202) continue;                         // ещё идёт — опрашиваем дальше
        if (p.status === 404) return text(`Скан завершился, но результат не добран (лок истёк). Попробуйте list_scans для ${url}.`, true);
        return text(apiError(p), true);                         // 401/429/503/500/сеть в poll — НЕ глотаем (Codex), диагностика сразу
      }
      return text(`Скан ${url} не завершился в отведённое время. Попробуйте позже get_scan/list_scans.`, true);
    }
    return text(apiError(r), true);
  }
);

server.tool(
  "get_scan",
  "Retrieve a previously saved ScanBase scan result by its scan_id (uuid from scan_site or list_scans). Use to re-read findings without spending a new scan. Only scans of this account; gated by the key's current tier. // Сохранённый результат скана по scan_id — перечитать находки, не тратя новый скан.",
  { scan_id: z.string().describe("scan_id (uuid) из результата scan_site или list_scans") },
  async ({ scan_id }: { scan_id: string }) => {
    if (!KEY) return text("SCANBASE_API_KEY не задан.", true);
    const r = await api("GET", `/scans/${encodeURIComponent(scan_id)}`);
    if (r.status === 200) return scanResult(r.json);
    return text(apiError(r), true);
  }
);

server.tool(
  "list_scans",
  "List this account's ScanBase scan history (last ≤100): scan_id, url, domain, score, violations count, date. Use to find a past scan_id, compare scores over time, or check scans across multiple projects. // История сканов аккаунта: найти прошлый scan_id, сравнить динамику балла.",
  {
    page: z.number().int().positive().optional().describe("Страница (по умолчанию 1)"),
    per_page: z.number().int().positive().max(50).optional().describe("Размер страницы, ≤50 (по умолчанию 20)"),
  },
  async ({ page, per_page }: { page?: number; per_page?: number }) => {
    if (!KEY) return text("SCANBASE_API_KEY не задан.", true);
    const qs = new URLSearchParams();
    if (page) qs.set("page", String(page));
    if (per_page) qs.set("per_page", String(per_page));
    const r = await api("GET", `/scans${qs.toString() ? "?" + qs.toString() : ""}`);
    if (r.status === 200) {
      const scans: any[] = Array.isArray(r.json?.scans) ? r.json.scans : [];
      const head = `История: ${scans.length} строк (окно «последние 100», window_size=${r.json?.window_size}, capped=${r.json?.capped}).`;
      const rows = scans.map((s) => `  • ${s.created_at || ""} · ${s.domain || s.url} · score ${s.score ?? "—"} · нарушений ${s.violations_count ?? "?"} · id ${s.scan_id}`);
      return text([head, ...rows].join("\n") + "\n\n```json\n" + JSON.stringify(r.json, null, 2) + "\n```");
    }
    return text(apiError(r), true);
  }
);

server.tool(
  "list_checks",
  "List all compliance checks ScanBase performs (currently ~45): id, name, category, law article, max fine in rubles. Call this BEFORE writing site code for the Russian market to build it compliant from the start, or to explain to the user what will be verified. Requires no scan and spends no quota. // Справочник всех проверок (статья закона, штраф) — чтобы строить сайт сразу правильно, не тратя скан.",
  {},
  async () => {
    if (!KEY) return text("SCANBASE_API_KEY не задан.", true);
    const r = await api("GET", "/checks");
    if (r.status === 200) {
      const checks: any[] = Array.isArray(r.json?.checks) ? r.json.checks : [];
      const cats: any[] = Array.isArray(r.json?.categories) ? r.json.categories : [];
      const lines: string[] = [
        `ScanBase проверяет ${r.json?.count ?? checks.length} пунктов в ${cats.length} категориях:`,
        "",
      ];
      let cur = "";
      for (const c of checks) {
        if (c.category !== cur) { cur = c.category; lines.push(`${cur}:`); }
        const law = c.law ? ` · ${c.law}` : "";
        const fine = c.fine_max ? ` · до ${Number(c.fine_max).toLocaleString("ru-RU")} ₽` : "";
        lines.push(`  • [${c.id}] ${c.name} (${c.type_label || c.type})${law}${fine}`);
      }
      lines.push("", "Состав проверок эволюционирует со сканером и НЕ является стабильным контрактом (см. поле note API).");
      return text(lines.join("\n"));
    }
    return text(apiError(r), true);
  }
);

server.tool(
  "account",
  "ScanBase account status for the configured API key: tier (free/package/subscription), remaining scan quota and reset time. Call before large scan batches or when a scan fails with a quota error. // Статус аккаунта: тариф и остаток квоты сканов.",
  {},
  async () => {
    if (!KEY) return text("SCANBASE_API_KEY не задан.", true);
    const r = await api("GET", "/account");
    if (r.status === 200) {
      const d = r.json;
      const q = d?.quota || {};
      const head = `Аккаунт ${d?.email} · тариф: ${d?.tier} · подписка: ${d?.subscription_active ? "активна" : "нет"} · квота: ${q.used}/${q.limit} использовано (осталось ${q.remaining}, сброс ${q.reset_at}).`;
      return text(head + "\n\n```json\n" + JSON.stringify(d, null, 2) + "\n```");
    }
    return text(apiError(r), true);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr — чтобы не мешать stdio-протоколу
  process.stderr.write(`scanbase-mcp запущен · API ${BASE} · ключ ${KEY ? "задан" : "НЕ задан"}\n`);
}

main().catch((e) => {
  process.stderr.write(`Фатальная ошибка scanbase-mcp: ${e?.stack || e}\n`);
  process.exit(1);
});

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const KEY = process.env.SCANBASE_API_KEY;
if (!KEY) { console.error("нет SCANBASE_API_KEY в env"); process.exit(1); }

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, SCANBASE_API_KEY: KEY },
});
const client = new Client({ name: "smoke", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).sort().join(", "));

const acc = await client.callTool({ name: "account", arguments: {} });
console.log("ACCOUNT:", acc.content[0].text.split("\n")[0]);

const scan = await client.callTool({ name: "scan_site", arguments: { url: "https://lstol.ru/" } });
console.log("SCAN head:", scan.content[0].text.split("\n").slice(0, 2).join(" | "));
console.log("SCAN isError:", !!scan.isError);

const list = await client.callTool({ name: "list_scans", arguments: { per_page: 3 } });
console.log("LIST head:", list.content[0].text.split("\n")[0]);

await client.close();
console.log("SMOKE OK");

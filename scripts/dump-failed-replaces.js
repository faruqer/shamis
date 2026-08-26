const fs = require("fs");

const TRANSCRIPT =
  "C:\\Users\\hp\\.cursor\\projects\\d-code-real-projects-Stock-and-Money\\agent-transcripts\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f.jsonl";

const targets = [
  "sidebar.tsx",
  "auth.ts",
  "utils.ts",
  "api-utils.ts",
  "clients/page.tsx",
  "salespersons/route.ts",
  "report-client.tsx",
];

const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n");

for (const line of lines) {
  if (!line.trim()) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const item of content) {
    if (item?.type !== "tool_use" || item.name !== "StrReplace") continue;
    const p = item.input?.path || "";
    if (!targets.some((t) => p.includes(t))) continue;
    console.log("---", p.split("\\").pop(), "---");
    console.log("OLD:", JSON.stringify(item.input.old_string).slice(0, 120));
    console.log("NEW:", JSON.stringify(item.input.new_string).slice(0, 120));
  }
}

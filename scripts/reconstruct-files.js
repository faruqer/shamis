const fs = require("fs");
const path = require("path");

const TRANSCRIPT =
  "C:\\Users\\hp\\.cursor\\projects\\d-code-real-projects-Stock-and-Money\\agent-transcripts\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f.jsonl";

const targetFiles = [
  "src/lib/auth.ts",
  "src/lib/api-utils.ts",
  "src/lib/utils.ts",
  "src/components/layout/sidebar.tsx",
  "src/app/clients/page.tsx",
];

const files = new Map();
const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n");

for (const line of lines) {
  if (!line.trim()) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;

  for (const item of content) {
    if (item?.type !== "tool_use") continue;
    const p = item.input?.path?.replace(/\\/g, "/") || "";
    const rel = targetFiles.find((t) => p.endsWith(t.replace(/\//g, "/")));
    if (!rel) continue;

    const norm = path.normalize(item.input.path);
    if (item.name === "Write") {
      files.set(norm, item.input.contents);
    } else if (item.name === "StrReplace") {
      const cur = files.get(norm);
      if (cur === undefined) continue;
      const { old_string, new_string, replace_all } = item.input;
      if (!cur.includes(old_string)) {
        console.error("FAILED:", rel, old_string.slice(0, 60));
        continue;
      }
      files.set(
        norm,
        replace_all
          ? cur.split(old_string).join(new_string)
          : cur.replace(old_string, new_string)
      );
    }
  }
}

for (const [f, c] of files) {
  console.log("\n\n==========", f, "==========\n");
  console.log(c);
}

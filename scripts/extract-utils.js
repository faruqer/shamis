const fs = require("fs");

const TRANSCRIPT =
  "C:\\Users\\hp\\.cursor\\projects\\d-code-real-projects-Stock-and-Money\\agent-transcripts\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f.jsonl";

const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes("formatCurrency") && !line.includes("api-utils") && !line.includes("clients/page")) continue;
  if (!line.includes("StrReplace")) continue;
  try {
    const obj = JSON.parse(line);
    for (const item of obj.message?.content || []) {
      if (item?.name !== "StrReplace") continue;
      const p = item.input?.path || "";
      if (p.includes("utils.ts") || p.includes("api-utils") || p.includes("clients/page")) {
        console.log("LINE", i + 1, p.split("\\").pop());
        console.log("NEW:\n", item.input.new_string);
        console.log("---");
      }
    }
  } catch {}
}

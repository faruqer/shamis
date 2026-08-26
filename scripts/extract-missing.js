const fs = require("fs");

const TRANSCRIPT =
  "C:\\Users\\hp\\.cursor\\projects\\d-code-real-projects-Stock-and-Money\\agent-transcripts\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f.jsonl";

const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n");

for (const line of lines) {
  if (!line.includes("resolveSession")) continue;
  const obj = JSON.parse(line);
  for (const item of obj.message.content) {
    if (item?.name === "StrReplace" && item.input?.path?.includes("auth.ts")) {
      console.log("=== AUTH REPLACE ===");
      console.log(item.input.new_string);
    }
    if (item?.name === "StrReplace" && item.input?.path?.includes("api-utils.ts")) {
      console.log("=== API UTILS REPLACE ===");
      console.log(item.input.new_string);
    }
    if (item?.name === "StrReplace" && item.input?.path?.includes("utils.ts")) {
      console.log("=== UTILS REPLACE ===");
      console.log(item.input.new_string);
    }
  }
}

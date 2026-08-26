const fs = require("fs");
const path = require("path");

const TRANSCRIPT =
  "C:\\Users\\hp\\.cursor\\projects\\d-code-real-projects-Stock-and-Money\\agent-transcripts\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f\\bf13e92b-5ea8-401a-9aa5-47ddfad5ac4f.jsonl";
const PROJECT_ROOT = "d:\\code\\real projects\\Stock and Money";

const files = new Map();
const ops = [];
const failed = [];

const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n");

for (const line of lines) {
  if (!line.trim()) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }

  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;

  for (const item of content) {
    if (item?.type !== "tool_use") continue;

    if (item.name === "Write") {
      const p = item.input?.path;
      const c = item.input?.contents;
      if (p && typeof c === "string" && p.includes("Stock and Money")) {
        ops.push({ type: "write", path: path.normalize(p), contents: c });
      }
    } else if (item.name === "StrReplace") {
      const p = item.input?.path;
      if (p && p.includes("Stock and Money")) {
        ops.push({
          type: "replace",
          path: path.normalize(p),
          old_string: item.input?.old_string ?? "",
          new_string: item.input?.new_string ?? "",
          replace_all: !!item.input?.replace_all,
        });
      }
    }
  }
}

for (const op of ops) {
  if (op.type === "write") {
    files.set(op.path, op.contents);
    continue;
  }

  const current = files.get(op.path);
  if (current === undefined) {
    failed.push({ path: op.path, reason: "file not in map yet (no prior Write)" });
    continue;
  }
  if (!current.includes(op.old_string)) {
    failed.push({ path: op.path, reason: "old_string not found" });
    continue;
  }
  const updated = op.replace_all
    ? current.split(op.old_string).join(op.new_string)
    : current.replace(op.old_string, op.new_string);
  files.set(op.path, updated);
}

// Write all files to disk
for (const [filePath, contents] of files) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else count++;
  }
  return count;
}

const srcCount = countFiles(path.join(PROJECT_ROOT, "src"));

// Unique failed paths
const failedByPath = {};
for (const f of failed) {
  failedByPath[f.path] = (failedByPath[f.path] || 0) + 1;
}

console.log(
  JSON.stringify(
    {
      totalOps: ops.length,
      filesRestored: files.size,
      srcFileCount: srcCount,
      strReplaceFailedCount: failed.length,
      failedByPath,
      paths: [...files.keys()].sort(),
    },
    null,
    2
  )
);

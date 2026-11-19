// Fails if a doc cites a repo path, npm script, or `SYMBOL` in `file` that no longer exists.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const docs = ["README.md", "README.pt-BR.md", "AGENTS.md", "DESIGN.md", ...readdirSync("docs").map((f) => join("docs", f))];
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
const errors = [];

for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  // Repo-relative paths in backticks or plain text
  for (const m of text.matchAll(/\b((?:src|docs|test|scripts|\.github)\/[\w./-]*\w)/g)) {
    if (!existsSync(m[1])) errors.push(`${doc}: missing path ${m[1]}`);
  }
  // Relative markdown links
  for (const m of text.replace(/```[\s\S]*?```/g, "").matchAll(/\]\(((?!https?:|#)[^)\s]+)\)/g)) {
    const target = join(doc.includes("/") ? doc.split("/").slice(0, -1).join("/") : ".", m[1].split("#")[0]);
    if (!existsSync(target)) errors.push(`${doc}: broken link ${m[1]}`);
  }
  // npm run <script>
  for (const m of text.matchAll(/npm run ([\w:-]+)/g)) {
    if (!scripts[m[1]]) errors.push(`${doc}: unknown npm script ${m[1]}`);
  }
  // `SYMBOL` in `src/file.ts`
  for (const m of text.matchAll(/`([A-Z][A-Z0-9_]{2,})` in `(src\/[\w./-]+)`/g)) {
    if (existsSync(m[2]) && !readFileSync(m[2], "utf8").includes(m[1])) errors.push(`${doc}: ${m[1]} not found in ${m[2]}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`docs ok (${docs.length} files)`);

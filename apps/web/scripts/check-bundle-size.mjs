// Fails when the built client assets grow past the recorded budget.
// Budgets are ~15-25% above the 2026-09-14 baseline (entry 360KB, largest
// lazy chunk 437KB, JS total ~1.15MB, CSS 216KB) so they trip on real bloat
// without flapping on small diffs. Raise them deliberately with evidence.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = new URL("../dist/client/assets/", import.meta.url).pathname;

const ENTRY_BUDGET_KB = 420;
const CHUNK_BUDGET_KB = 500;
const TOTAL_JS_BUDGET_KB = 1500;
const TOTAL_CSS_BUDGET_KB = 260;

let files;
try {
  files = readdirSync(ASSETS_DIR);
} catch {
  console.error(`bundle budget: ${ASSETS_DIR} not found — run npm run build first.`);
  process.exit(1);
}

const jsFiles = files.filter((name) => name.endsWith(".js"));
const cssFiles = files.filter((name) => name.endsWith(".css"));
const sizeOf = (name) => statSync(join(ASSETS_DIR, name)).size;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

const failures = [];
let totalJs = 0;
for (const name of jsFiles) {
  const size = sizeOf(name);
  totalJs += size;
  const isEntry = name.startsWith("index-");
  const budget = (isEntry ? ENTRY_BUDGET_KB : CHUNK_BUDGET_KB) * 1024;
  if (size > budget) {
    failures.push(`${name} is ${kb(size)} (budget ${isEntry ? ENTRY_BUDGET_KB : CHUNK_BUDGET_KB}KB)`);
  }
}

const totalCss = cssFiles.reduce((sum, name) => sum + sizeOf(name), 0);
if (totalJs > TOTAL_JS_BUDGET_KB * 1024) {
  failures.push(`total JS is ${kb(totalJs)} (budget ${TOTAL_JS_BUDGET_KB}KB)`);
}
if (totalCss > TOTAL_CSS_BUDGET_KB * 1024) {
  failures.push(`total CSS is ${kb(totalCss)} (budget ${TOTAL_CSS_BUDGET_KB}KB)`);
}

if (failures.length) {
  console.error("bundle budget exceeded:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `bundle budget ok: ${jsFiles.length} js chunks, total ${kb(totalJs)}, css ${kb(totalCss)}`,
);

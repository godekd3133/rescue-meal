// Fails when the built client assets grow past the recorded budget.
// Budgets are ~15-25% above the 2026-09-14 baseline (entry 360KB, largest
// lazy chunk 437KB, JS total ~1.15MB, CSS 216KB) so they trip on real bloat
// without flapping on small diffs. Raise them deliberately with evidence.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = new URL("../dist/client/assets/", import.meta.url).pathname;

const ENTRY_BUDGET_KB = 420;
const CHUNK_BUDGET_KB = 500;
// Raised to 1530KB on 2026-11-05 for the IA overhaul (src/screens/*: tab screens) and the
// quick-add sheet (QuickAdd + its parser), both lazy or small; ~1.52MB shipped.
const TOTAL_JS_BUDGET_KB = 1530;
// Raised from 260KB on 2026-11-02: the shipped stylesheet measures 286KB (45KB gzip)
// and has no duplicate overridden declarations left to drop. 300KB stops further growth.
// Raised to 320KB on 2026-11-04 for the freshness redesign (overview tiles, days-left
// chips, softer surfaces in src/freshness.css): ~304KB shipped.
// Raised to 335KB on 2026-11-05 for the "inside the fridge" layer (kitchen.css +
// rescueDeck.css, ~15KB) that re-points the legacy atelier tokens instead of rewriting
// prototype.css; shrinking prototype.css is the way back under 320KB.
// Raised to 350KB on 2026-11-05: src/screens.css (tab screens, net ~+3KB after fridge.css
// was removed) and the quick-add sheet styles (~+10KB in the AddFoodSheet chunk).
const TOTAL_CSS_BUDGET_KB = 350;

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

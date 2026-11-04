// Builds the backend-free try-it demo into the portfolio repository and checks it.
// Usage: npm run build:portfolio-demo            (RESCUE_MEAL_DEMO_OUT_DIR overrides the target)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(
  process.env.RESCUE_MEAL_DEMO_OUT_DIR ?? path.join(webDirectory, "../../../../linked-me/public/demos/rescue-meal"),
);
const MAX_BYTES = 15 * 1024 * 1024;
// Public files the try-it build never loads. Receipt images are review-tool fixtures.
const PRUNED_PATHS = ["sw.js", "manifest.webmanifest", "assets/iphone", "assets/android", "assets/receipts", "assets/food/README.md"];
const FORBIDDEN_CONTENT = [
  [/rescue-meal\.[a-z0-9-]+\.(?:com|app|dev|run\.app)/i, "deployed service host"],
  [/run\.app|ghcr\.io|sentry\.io/i, "infrastructure host"],
  [/\/Users\/|\/home\/[a-z]/, "local path"],
  [/\bBearer [A-Za-z0-9_-]{12,}/, "bearer token"],
  [/\beyJ[A-Za-z0-9_-]{16,}\./, "JWT"],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+/, "API key"],
  [/[A-Za-z0-9._%+-]+@(?:naver|gmail|kakao|daum|hanmail|bagelcode)\.[a-z.]+/i, "personal email"],
  [/\b01[016789]-?\d{3,4}-?\d{4}\b/, "phone number"],
  [/navigator\.serviceWorker\s*\.register/, "service worker registration"],
];

execFileSync(path.join(webDirectory, "node_modules/.bin/vite"), ["build", "--config", "vite.demo.config.ts"], {
  cwd: webDirectory,
  stdio: "inherit",
  env: { ...process.env, RESCUE_MEAL_DEMO_OUT_DIR: outDir },
});

for (const relativePath of PRUNED_PATHS) rmSync(path.join(outDir, relativePath), { recursive: true, force: true });

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

const files = listFiles(outDir);
const problems = [];
let totalBytes = 0;
for (const file of files) {
  totalBytes += statSync(file).size;
  if (file.endsWith(".map")) problems.push(`source map: ${file}`);
  if (!/\.(?:html|js|css|svg|json|webmanifest|txt)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of FORBIDDEN_CONTENT) {
    if (pattern.test(text)) problems.push(`${label} in ${path.relative(outDir, file)}: ${text.match(pattern)[0].slice(0, 40)}`);
  }
}
if (totalBytes > MAX_BYTES) problems.push(`bundle is ${totalBytes} bytes (budget ${MAX_BYTES})`);

if (problems.length) {
  console.error(`portfolio demo check failed:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`portfolio demo ok: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)}MB -> ${outDir}`);

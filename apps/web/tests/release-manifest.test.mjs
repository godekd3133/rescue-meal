import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const webRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(webRoot, "scripts", "create-release-manifest.mjs");

function readPngDimensions(filePath) {
  const buffer = readFileSync(filePath);
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("PWA metadata carries native iOS and installable raster icons", () => {
  const indexHtml = readFileSync(path.join(webRoot, "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(path.join(webRoot, "public", "manifest.webmanifest"), "utf8"));
  assert.match(indexHtml, /<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/rescue-meal-180\.png"\s*\/>/);
  assert.deepEqual(manifest.icons, [
    { src: "/icons/rescue-meal-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/rescue-meal-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  for (const [fileName, dimensions] of [["rescue-meal-180.png", [180, 180]], ["rescue-meal-192.png", [192, 192]], ["rescue-meal-512.png", [512, 512]]]) {
    const filePath = path.join(webRoot, "public", "icons", fileName);
    assert.equal(existsSync(filePath), true, `${fileName} should exist`);
    assert.deepEqual(Object.values(readPngDimensions(filePath)), dimensions, `${fileName} dimensions`);
  }
});

test("release manifest records revision-safe inputs without secrets or workspace data", () => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "rescue-meal-release-manifest-"));
  const outputPath = path.join(tempDirectory, "manifest.json");
  try {
    const ciHead = "a".repeat(40);
    execFileSync(process.execPath, [scriptPath, "--output", outputPath], {
      cwd: webRoot,
      env: { ...process.env, VITE_DEPLOYMENT_MODE: "production", GITHUB_SHA: ciHead, GITHUB_REF_NAME: "main" },
      stdio: "pipe",
    });
    const raw = readFileSync(outputPath, "utf8");
    const manifest = JSON.parse(raw);
    assert.equal(manifest.schema_version, "rescue-meal-release-manifest-v1");
    assert.equal(manifest.repository.head, ciHead);
    assert.equal(manifest.repository.branch, "main");
    assert.equal(typeof manifest.repository.dirty, "boolean");
    assert.equal(manifest.runtime.deployment_mode, "production");
    assert.equal(manifest.security.contains_secrets, false);
    assert.deepEqual(manifest.missing_inputs, []);
    assert.ok(Array.isArray(manifest.missing_artifacts));
    assert.ok(manifest.inputs["apps/web/package-lock.json"].sha256);
    assert.ok(manifest.inputs["services/api/uv.lock"].sha256);
    assert.ok(manifest.inputs["infra/postgres/migrate.sh"].sha256);
    assert.match(manifest.migrations.baseline, /^infra\/postgres\/025_/);
    assert.ok(manifest.migrations.files.length >= 25);
    assert.equal(raw.includes("access_token"), false);
    assert.equal(raw.includes("workspace_id"), false);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

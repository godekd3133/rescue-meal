#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(webRoot, "..", "..");

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function git(...args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function environmentValue(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function fileRecord(relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return { path: relativePath, exists: false };
  }
  const stat = statSync(absolutePath);
  return {
    path: relativePath,
    exists: true,
    bytes: stat.size,
    sha256: sha256(absolutePath),
  };
}

const outputArgument = option("--output", "/tmp/rescue-meal-release-manifest.json");
const outputPath = resolve(process.cwd(), outputArgument);
const requireArtifacts = hasFlag("--require-artifacts");
const migrationDirectory = resolve(repositoryRoot, "infra", "postgres");
const migrationFiles = existsSync(migrationDirectory)
  ? readdirSync(migrationDirectory)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort()
    .map((name) => `infra/postgres/${name}`)
  : [];

const trackedInputs = [
  ".env.example",
  ".github/workflows/verify.yml",
  "README.md",
  "context.md",
  "scorecard.md",
  "apps/web/index.html",
  "apps/web/package.json",
  "apps/web/package-lock.json",
  "apps/web/public/manifest.webmanifest",
  "apps/web/public/icons/rescue-meal-180.png",
  "apps/web/public/icons/rescue-meal-192.png",
  "apps/web/public/icons/rescue-meal-512.png",
  "apps/web/scripts/create-release-manifest.mjs",
  "apps/web/mobile-runtime.lock.json",
  "services/api/pyproject.toml",
  "services/api/uv.lock",
  "services/ocr-worker/Dockerfile",
  "services/ocr-worker/uv.lock",
  "infra/postgres/migrate.sh",
  ...migrationFiles,
];

const requiredInputs = [
  ".env.example",
  ".github/workflows/verify.yml",
  "apps/web/index.html",
  "apps/web/package.json",
  "apps/web/package-lock.json",
  "apps/web/public/manifest.webmanifest",
  "apps/web/public/icons/rescue-meal-180.png",
  "apps/web/public/icons/rescue-meal-192.png",
  "apps/web/public/icons/rescue-meal-512.png",
  "apps/web/scripts/create-release-manifest.mjs",
  "apps/web/mobile-runtime.lock.json",
  "services/api/pyproject.toml",
  "services/api/uv.lock",
  "services/ocr-worker/Dockerfile",
  "services/ocr-worker/uv.lock",
  "infra/postgres/migrate.sh",
  ...migrationFiles,
];
const missingRequiredInputs = requiredInputs.filter((path) => !existsSync(resolve(repositoryRoot, path)));
if (missingRequiredInputs.length) {
  throw new Error(`release manifest required inputs are missing: ${missingRequiredInputs.join(", ")}`);
}

const artifactPaths = [
  "apps/web/dist/client/index.html",
  "apps/web/dist/server/index.js",
  "apps/web/dist/.openai/hosting.json",
  "apps/web/dist/client/manifest.webmanifest",
];
const artifactRecords = artifactPaths.map((path) => fileRecord(path));
const missingArtifacts = artifactRecords.filter((record) => !record.exists).map((record) => record.path);
if (requireArtifacts && missingArtifacts.length) {
  throw new Error(`release manifest required artifacts are missing: ${missingArtifacts.join(", ")}`);
}

const rawStatus = git("status", "--porcelain=v1") ?? "";
const manifest = {
  schema_version: "rescue-meal-release-manifest-v1",
  generated_at: new Date().toISOString(),
  repository: {
    head: environmentValue("GITHUB_SHA") ?? git("rev-parse", "HEAD"),
    branch: environmentValue("GITHUB_REF_NAME") ?? git("symbolic-ref", "--quiet", "--short", "HEAD"),
    dirty: Boolean(rawStatus),
    changed_path_count: rawStatus ? rawStatus.split("\n").filter(Boolean).length : 0,
  },
  runtime: {
    node: process.version,
    deployment_mode: process.env.VITE_DEPLOYMENT_MODE ?? null,
  },
  migrations: {
    baseline: migrationFiles.at(-1) ?? null,
    files: migrationFiles.map((path) => fileRecord(path)),
  },
  inputs: trackedInputs.reduce((result, path) => {
    result[path] = fileRecord(path);
    return result;
  }, {}),
  missing_inputs: trackedInputs.filter((path) => !existsSync(resolve(repositoryRoot, path))),
  artifacts: artifactRecords,
  missing_artifacts: missingArtifacts,
  security: {
    contains_secrets: false,
    omitted: ["access tokens", "provider keys", "passwords", "OCR source bytes", "workspace data"],
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ output: outputPath, head: manifest.repository.head, dirty: manifest.repository.dirty }, null, 2)}\n`);

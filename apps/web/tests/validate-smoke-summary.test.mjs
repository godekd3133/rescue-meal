import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveSmokeArtifactPath } from "../scripts/smoke-artifact-path.mjs";

const validator = join(process.cwd(), "scripts/validate-smoke-summary.mjs");

function runValidator(payload) {
  const directory = mkdtempSync(join(tmpdir(), "rescue-meal-smoke-summary-"));
  const filePath = join(directory, "summary.json");
  writeFileSync(filePath, JSON.stringify(payload), "utf8");
  try {
    return spawnSync(process.execPath, [validator, filePath], { encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("accepts a passed lane summary", () => {
  const result = runValidator({ status: "passed", runnerVersion: "smoke-runner-v1", generatedAt: new Date().toISOString(), artifactRetained: false, releaseReady: false, lanes: [{ label: "native", script: "test:smoke:native", status: "passed", elapsedSeconds: 1.2 }] });
  assert.equal(result.status, 0);
});

test("rejects malformed lane metadata", () => {
  const result = runValidator({ status: "passed", lanes: [{ label: "native", script: "test:smoke:native", status: "unknown", elapsedSeconds: -1 }] });
  assert.notEqual(result.status, 0);
});

test("rejects an incoherent aggregate status", () => {
  const result = runValidator({ status: "passed", lanes: [{ label: "native", script: "test:smoke:native", status: "failed", elapsedSeconds: 1.2, exitCode: 1 }] });
  assert.notEqual(result.status, 0);
});

test("accepts a failed summary with an explicit failed lane", () => {
  const result = runValidator({ status: "failed", lanes: [{ label: "connected", script: "test:smoke:connected", status: "failed", elapsedSeconds: 3.4, exitCode: 1 }] });
  assert.equal(result.status, 0);
});

test("accepts a failed-to-start lane summary", () => {
  const result = runValidator({ status: "failed", lanes: [{ label: "native", script: "test:smoke:native", status: "failed-to-start", elapsedSeconds: 0.1, exitCode: 3 }] });
  assert.equal(result.status, 0);
});

test("rejects release-ready without a retained passed artifact", () => {
  const result = runValidator({ status: "passed", artifactRetained: false, releaseReady: true, lanes: [{ label: "native", script: "test:smoke:native", status: "passed", elapsedSeconds: 1.2 }] });
  assert.notEqual(result.status, 0);
});

test("rejects invalid generated-at metadata", () => {
  const result = runValidator({ status: "passed", runnerVersion: "smoke-runner-v1", generatedAt: "not-a-date", artifactRetained: false, releaseReady: false, lanes: [{ label: "native", script: "test:smoke:native", status: "passed", elapsedSeconds: 1.2 }] });
  assert.notEqual(result.status, 0);
});

test("rejects an unsupported runner version", () => {
  const result = runValidator({ status: "passed", runnerVersion: "smoke-runner-v0", generatedAt: new Date().toISOString(), artifactRetained: false, releaseReady: false, lanes: [{ label: "native", script: "test:smoke:native", status: "passed", elapsedSeconds: 1.2 }] });
  assert.notEqual(result.status, 0);
});

test("rejects relative artifact paths and accepts explicit absolute paths", () => {
  assert.equal(resolveSmokeArtifactPath(""), null);
  assert.throws(() => resolveSmokeArtifactPath("artifacts/summary.json"), /absolute path/);
  assert.equal(resolveSmokeArtifactPath("/tmp/summary.json"), "/tmp/summary.json");
});

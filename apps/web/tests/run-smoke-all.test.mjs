import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("runner writes a schema-valid failed summary for a failed lane", () => {
  const directory = mkdtempSync(join(tmpdir(), "rescue-meal-smoke-runner-"));
  const outputPath = join(directory, "summary.json");
  try {
    const result = spawnSync(process.execPath, ["scripts/run-smoke-all.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, SMOKE_LANES_JSON: JSON.stringify([["forced failure", "__missing_smoke_script__"]]), SMOKE_ALLOW_LANE_OVERRIDE: "1", SMOKE_SUMMARY_OUTPUT: outputPath, SMOKE_VALIDATE_OUTPUT: "1" },
    });
    assert.notEqual(result.status, 0);
    const summary = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(summary.status, "failed");
    assert.equal(summary.lanes[0].status, "failed");
    assert.equal(summary.lanes[0].exitCode, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects lane override without the explicit test guard", () => {
  const result = spawnSync(process.execPath, ["scripts/run-smoke-all.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SMOKE_LANES_JSON: JSON.stringify([["unexpected", "noop"]]), SMOKE_ALLOW_LANE_OVERRIDE: "0" },
  });
  assert.equal(result.status, 2);
});

test("requires an artifact path when release-ready mode is enabled", () => {
  const result = spawnSync(process.execPath, ["scripts/run-smoke-all.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SMOKE_LANES_JSON: JSON.stringify([["forced failure", "__missing_smoke_script__"]]), SMOKE_ALLOW_LANE_OVERRIDE: "1", SMOKE_REQUIRE_RELEASE_READY: "1" },
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /SMOKE_SUMMARY_OUTPUT/);
});

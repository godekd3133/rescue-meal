import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolveSmokeArtifactPath } from "./smoke-artifact-path.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const RUNNER_VERSION = "smoke-runner-v1";
const defaultLanes = [
  ["runtime/build/diff", "test:smoke:runtime"],
  ["native full", "test:smoke:native"],
  ["connected full", "test:smoke:connected"],
];
let lanes = defaultLanes;
if (process.env.SMOKE_LANES_JSON) {
  if (process.env.SMOKE_ALLOW_LANE_OVERRIDE !== "1") {
    console.error("SMOKE_LANES_JSON requires SMOKE_ALLOW_LANE_OVERRIDE=1");
    process.exit(2);
  }
  try {
    const override = JSON.parse(process.env.SMOKE_LANES_JSON);
    if (!Array.isArray(override) || !override.every((lane) => Array.isArray(lane) && lane.length === 2 && lane.every((value) => typeof value === "string"))) throw new Error("expected [[label, script], ...]");
    lanes = override;
  } catch (error) {
    console.error(`Invalid SMOKE_LANES_JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
const summary = [];

function emitSummary(status) {
  const outputPath = resolveSmokeArtifactPath(process.env.SMOKE_SUMMARY_OUTPUT);
  if (!outputPath) {
    const payload = { status, runnerVersion: RUNNER_VERSION, generatedAt: new Date().toISOString(), artifactRetained: false, releaseReady: false, lanes: summary };
    console.log(`SMOKE_SUMMARY_JSON=${JSON.stringify(payload)}`);
    if (process.env.CI || process.env.SMOKE_REQUIRE_RELEASE_READY === "1") console.warn("SMOKE_SUMMARY_OUTPUT is not set; CI will not retain a smoke summary artifact.");
    if (process.env.SMOKE_REQUIRE_RELEASE_READY === "1") {
      console.error("Release-ready smoke requires SMOKE_SUMMARY_OUTPUT.");
      process.exit(1);
    }
    return;
  }
  const payload = { status, runnerVersion: RUNNER_VERSION, generatedAt: new Date().toISOString(), artifactRetained: true, releaseReady: status === "passed", lanes: summary };
  try {
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (error) {
    console.log(`SMOKE_SUMMARY_JSON=${JSON.stringify({ status, runnerVersion: RUNNER_VERSION, generatedAt: new Date().toISOString(), artifactRetained: false, releaseReady: false, lanes: summary })}`);
    console.error(`Unable to write smoke summary artifact at ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Create the parent directory or provide a writable absolute SMOKE_SUMMARY_OUTPUT path.");
    process.exit(1);
  }
  console.log(`SMOKE_SUMMARY_JSON=${JSON.stringify(payload)}`);
  if (process.env.SMOKE_VALIDATE_OUTPUT !== "1") return;
  const validation = spawnSync(process.execPath, ["scripts/validate-smoke-summary.mjs", outputPath], { stdio: "inherit", env: process.env });
  if (validation.error || validation.status !== 0) {
    console.error("smoke summary validation failed");
    process.exit(1);
  }
}

for (const [label, script] of lanes) {
  console.log(`\n=== smoke lane: ${label} (${script}) ===`);
  const startedAt = Date.now();
  const result = spawnSync(npmCommand, ["run", script], { stdio: "inherit", env: process.env });
  if (result.error) {
    summary.push({ label, script, status: "failed-to-start", elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)) });
    emitSummary("failed");
    console.error(`smoke lane failed to start: ${label}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    summary.push({ label, script, status: "failed", exitCode: result.status ?? null, elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)) });
    emitSummary("failed");
    console.error(`smoke lane failed: ${label} (exit ${result.status ?? "signal"})`);
    process.exit(result.status ?? 1);
  }
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  summary.push({ label, script, status: "passed", elapsedSeconds: Number(elapsedSeconds) });
  console.log(`=== smoke lane passed: ${label} (${elapsedSeconds}s) ===`);
}

console.log("\n=== smoke all passed: runtime/build/diff + native full + connected full ===");
emitSummary("passed");

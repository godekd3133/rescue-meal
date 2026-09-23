import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/validate-smoke-summary.mjs <summary.json>");
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(readFileSync(filePath, "utf8"));
} catch (error) {
  console.error(`Invalid smoke summary JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const validStatuses = new Set(["passed", "failed"]);
const validLaneStatuses = new Set(["passed", "failed", "failed-to-start"]);
const supportedRunnerVersions = new Set(["smoke-runner-v1"]);
if (typeof payload?.runnerVersion === "string" && !supportedRunnerVersions.has(payload.runnerVersion)) {
  console.error(`Unsupported smoke runner version: ${payload.runnerVersion}. Supported versions: ${[...supportedRunnerVersions].join(", ")}`);
  console.error("Migration checklist: update the runner version constant, supported-version set, validator fixture, and smoke contract tests before accepting this evidence.");
}
const lanes = Array.isArray(payload?.lanes) ? payload.lanes : [];
const laneStatusCoherent = payload?.status === "passed"
  ? lanes.length > 0 && lanes.every((lane) => lane?.status === "passed")
  : lanes.some((lane) => lane?.status === "failed" || lane?.status === "failed-to-start");
const valid = payload
  && validStatuses.has(payload.status)
  && (payload.runnerVersion === undefined || supportedRunnerVersions.has(payload.runnerVersion))
  && (payload.runnerVersion === undefined || typeof payload.runnerVersion === "string")
  && (payload.generatedAt === undefined || (typeof payload.generatedAt === "string" && !Number.isNaN(Date.parse(payload.generatedAt))))
  && (payload.artifactRetained === undefined || typeof payload.artifactRetained === "boolean")
  && (payload.releaseReady === undefined || typeof payload.releaseReady === "boolean")
  && (payload.releaseReady !== true || (payload.status === "passed" && payload.artifactRetained === true))
  && Array.isArray(payload.lanes)
  && payload.lanes.length > 0
  && laneStatusCoherent
  && payload.lanes.every((lane) => (
    lane
    && typeof lane.label === "string"
    && typeof lane.script === "string"
    && validLaneStatuses.has(lane.status)
    && typeof lane.elapsedSeconds === "number"
    && lane.elapsedSeconds >= 0
    && (lane.status === "passed" || lane.exitCode === null || typeof lane.exitCode === "number")
  ));

if (!valid) {
  console.error("Smoke summary schema validation failed");
  process.exit(1);
}

console.log(`Smoke summary valid: ${payload.status}, ${payload.lanes.length} lane(s)`);

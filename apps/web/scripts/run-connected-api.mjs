#!/usr/bin/env node

import { rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webDirectory, "../..");
const apiProjectDirectory = path.join(repositoryRoot, "services", "api");
const apiPort = Number(process.env.RESCUE_MEAL_E2E_API_PORT ?? 8001);
const webPort = Number(process.env.RESCUE_MEAL_E2E_WEB_PORT ?? 4178);
const uvCommand = process.env.RESCUE_MEAL_UV_BIN ?? "uv";
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rescue-meal-connected-"));
const databasePath = path.join(temporaryDirectory, "workspace.db");

const child = spawn(
  uvCommand,
  ["run", "--project", apiProjectDirectory, "--no-dev", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
  {
    cwd: apiProjectDirectory,
    env: {
      ...process.env,
      RESCUE_MEAL_SQLITE_PATH: databasePath,
      RESCUE_MEAL_AUTH_REQUIRED: "false",
      RESCUE_MEAL_CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
      RESCUE_MEAL_ACCESS_LOG: "false",
      UV_PROJECT_ENVIRONMENT: path.join(temporaryDirectory, ".venv"),
    },
    stdio: "inherit",
  },
);

let shuttingDown = false;
const forwardSignal = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill(signal);
};
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

const exitCode = await new Promise((resolve) => {
  child.once("error", (error) => {
    console.error(`Connected API launcher failed: ${error.message}`);
    resolve(1);
  });
  child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1));
});

await rm(temporaryDirectory, { recursive: true, force: true });
process.exitCode = exitCode;

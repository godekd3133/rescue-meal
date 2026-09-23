import { isAbsolute } from "node:path";

export function resolveSmokeArtifactPath(value) {
  const outputPath = value?.trim();
  if (!outputPath) return null;
  if (!isAbsolute(outputPath)) throw new Error(`SMOKE_SUMMARY_OUTPUT must be an absolute path: ${outputPath}`);
  return outputPath;
}

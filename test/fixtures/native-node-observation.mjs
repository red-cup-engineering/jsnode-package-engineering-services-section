// Actual native subprocesses for source-owned tests. Keep visible reporter
// bindings and unrelated runtime options; assertions read their own TAP copy.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composePackageTestReporters } from "../../src/package-test-reporters.mjs";

export function runNodeWithTestObservation(args, cwd) {
  // A nested suite must be a new runner, not another worker of its caller.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const options = { cwd, encoding: "utf8", timeout: 15_000, env };
  const test = args.indexOf("--test");
  if (test === -1) return spawnSync(process.execPath, args, options);
  const directory = mkdtempSync(join(tmpdir(), "native-test-observation-"));
  const destination = join(directory, "report.tap");
  try {
    const composed = composePackageTestReporters({
      arguments: args.slice(0, test), nodeOptions: env.NODE_OPTIONS,
      additionalReporters: [{ reporter: "tap", destination }],
    });
    const result = spawnSync(process.execPath, [...composed.arguments, ...args.slice(test)], options);
    let tap = "";
    try { tap = readFileSync(destination, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    return { ...result, tap };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

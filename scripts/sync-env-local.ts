import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  envForChildProcess,
  parseEnvFile,
  syncEnvLocal,
  type SyncEnvLocalResult,
} from "./lib/sync-env-local";

function logResult(result: SyncEnvLocalResult) {
  const action = result.wrote ? "wrote" : "left unchanged";
  console.info(
    `env:sync ${action} ${result.path} (${result.keyCount} keys, cloud=${result.cloudAgent}, clerk=${result.clerk})`,
  );
  if (result.cloudAgent && result.clerk === "missing") {
    console.warn(
      "Clerk keys are missing or unusable. Use the Cloud Agent dashboard secrets; do not invent placeholder values.",
    );
  }
}

export const EXEC_USAGE =
  "usage: tsx scripts/sync-env-local.ts [--exec <command> [args...]]";

/**
 * Absent `--exec` → empty exec (sync-only).
 * Present `--exec` with no following command → usage error (must not sync-only).
 */
export function parseExecArgs(argv: string[]): {
  exec: string[];
  error?: string;
} {
  const execIndex = argv.indexOf("--exec");
  if (execIndex === -1) return { exec: [] };
  const exec = argv.slice(execIndex + 1);
  if (exec.length === 0) {
    return { exec: [], error: `Missing command after --exec. ${EXEC_USAGE}` };
  }
  return { exec };
}

/** Same status code as bare `pnpm env:sync` when Cloud Agent Clerk is missing. */
export function syncEnvStatusExitCode(
  result: Pick<SyncEnvLocalResult, "cloudAgent" | "clerk">,
): number {
  return result.cloudAgent && result.clerk === "missing" ? 1 : 0;
}

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export type LaunchExecDeps = {
  spawn: SpawnFn;
  existsSync?: typeof existsSync;
  readFileSync?: typeof readFileSync;
  exit: (code: number) => void;
};

/**
 * After sync: fail closed when Cloud Agent Clerk is missing (never spawn),
 * preserving exit code 1. Otherwise spawn `--exec` or exit 0 with no command.
 */
export function launchExecAfterSync(
  result: SyncEnvLocalResult,
  exec: string[],
  deps: LaunchExecDeps,
): void {
  const missingClerkCode = syncEnvStatusExitCode(result);
  if (missingClerkCode !== 0) {
    deps.exit(missingClerkCode);
    return;
  }
  if (exec.length === 0) {
    deps.exit(0);
    return;
  }

  const exists = deps.existsSync ?? existsSync;
  const read = deps.readFileSync ?? readFileSync;
  const fileValues = exists(result.path)
    ? parseEnvFile(read(result.path, "utf8"))
    : {};
  const child = deps.spawn(exec[0]!, exec.slice(1), {
    stdio: "inherit",
    env: envForChildProcess(fileValues) as NodeJS.ProcessEnv,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      deps.exit(1);
      return;
    }
    deps.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(error);
    deps.exit(1);
  });
}

export function main(argv = process.argv.slice(2)): void {
  const { exec, error } = parseExecArgs(argv);
  if (error) {
    console.error(error);
    process.exit(1);
    return;
  }
  const result = syncEnvLocal();
  logResult(result);
  launchExecAfterSync(result, exec, {
    spawn,
    exit: (code) => {
      process.exit(code);
    },
  });
}

// Vitest imports this module for unit tests; skip side effects there.
if (!process.env.VITEST) {
  main();
}

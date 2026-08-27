import { spawn } from "node:child_process";

import {
  envForChildProcess,
  parseEnvFile,
  syncEnvLocal,
} from "./lib/sync-env-local";
import { existsSync, readFileSync } from "node:fs";

function logResult(result: ReturnType<typeof syncEnvLocal>) {
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

function parseExecArgs(argv: string[]): { exec: string[] } {
  const execIndex = argv.indexOf("--exec");
  if (execIndex === -1) return { exec: [] };
  return { exec: argv.slice(execIndex + 1) };
}

const result = syncEnvLocal();
logResult(result);

const { exec } = parseExecArgs(process.argv.slice(2));
if (exec.length === 0) {
  process.exit(result.cloudAgent && result.clerk === "missing" ? 1 : 0);
}

const fileValues = existsSync(result.path)
  ? parseEnvFile(readFileSync(result.path, "utf8"))
  : {};
const child = spawn(exec[0]!, exec.slice(1), {
  stdio: "inherit",
  env: envForChildProcess(fileValues) as NodeJS.ProcessEnv,
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LOCAL_POSTGRES = {
  POSTGRES_URL: "postgres://glitter:glitter@127.0.0.1:5432/glitter_dev",
  POSTGRES_DATABASE: "glitter_dev",
  POSTGRES_HOST: "127.0.0.1",
  POSTGRES_PASSWORD: "glitter",
  POSTGRES_USER: "glitter",
  TEST_DATABASE_URL: "postgres://glitter:glitter@127.0.0.1:5432/glitter_test",
} as const;

/** Same rule as AGENTS.md / integration tests: only test|ci DB names are safe overrides. */
export const TEST_OR_CI_DATABASE_NAME_RE = /(^|[_-])(test|ci)([_-]|$)/i;

export function databaseNameFromPostgresUrl(
  url: string | undefined,
): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

export function isTestOrCiDatabaseUrl(url: string | undefined): boolean {
  const name = databaseNameFromPostgresUrl(url);
  return name != null && TEST_OR_CI_DATABASE_NAME_RE.test(name);
}

export const ENV_KEY_ORDER = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "SEED_DEMO_PASSWORD",
  "ALLOW_DEV_SEED",
  "POSTGRES_URL",
  "POSTGRES_DATABASE",
  "POSTGRES_HOST",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
  "TEST_DATABASE_URL",
  "RESEND_API_KEY",
  "NEXT_PUBLIC_BASE_URL",
  "VERCEL_ENV",
  "UPLOADTHING_TOKEN",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_ILLUSTRATION_GROUP_LINK",
  "NEXT_PUBLIC_GASTRONOMY_GROUP_LINK",
  "NEXT_PUBLIC_ENTREPRENEURSHIP_GROUP_LINK",
  "CRON_SECRET",
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_ADMIN_STORAGE_STATE",
] as const;

const PLACEHOLDER_RE = /placeholder|_not_real/i;

export function isCloudAgentEnv(
  env: NodeJS.Dict<string> = process.env,
): boolean {
  return Boolean(
    env.CLOUD_AGENT_ALL_SECRET_NAMES || env.CLOUD_AGENT_INJECTED_SECRET_NAMES,
  );
}

export function isPlaceholderValue(value: string | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  if (trimmed === "") return true;
  return PLACEHOLDER_RE.test(trimmed);
}

export function isUsableSecretValue(value: string | undefined): boolean {
  return !isPlaceholderValue(value);
}

/**
 * Cloud Agent default is LOCAL_POSTGRES (dev DB). An explicit POSTGRES_URL in the
 * parent env is preserved only when it targets a test/ci database (e.g.
 * `POSTGRES_URL="$TEST_DATABASE_URL" pnpm migrate`).
 */
export function applyLocalPostgresDefaults(
  target: Record<string, string>,
  processEnv: NodeJS.Dict<string>,
): void {
  const explicitUrl = processEnv.POSTGRES_URL;
  const preserveTestOverride =
    isUsableSecretValue(explicitUrl) && isTestOrCiDatabaseUrl(explicitUrl);

  Object.assign(target, LOCAL_POSTGRES);

  if (preserveTestOverride && explicitUrl) {
    target.POSTGRES_URL = explicitUrl;
    const dbName = databaseNameFromPostgresUrl(explicitUrl);
    if (dbName) target.POSTGRES_DATABASE = dbName;
  }
}

export function cloudSecretNames(env: NodeJS.Dict<string> = process.env): string[] {
  const names = new Set<string>();
  for (const raw of [
    env.CLOUD_AGENT_ALL_SECRET_NAMES,
    env.CLOUD_AGENT_INJECTED_SECRET_NAMES,
  ]) {
    if (!raw) continue;
    for (const name of raw.split(",")) {
      const key = name.trim();
      if (key) names.add(key);
    }
  }
  return [...names];
}

/** Decode escapes produced by `encodeEnvValue` (`\\`, `\"`, `\\n`). */
export function unescapeEnvValue(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && i + 1 < value.length) {
      const next = value[i + 1]!;
      if (next === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (next === '"' || next === "\\") {
        out += next;
        i++;
        continue;
      }
    }
    out += value[i]!;
  }
  return out;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = unescapeEnvValue(value.slice(1, -1));
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function encodeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]*$/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

export function pickBestValue(
  candidates: Array<string | undefined>,
): string | undefined {
  for (const value of candidates) {
    if (isUsableSecretValue(value)) return value;
  }
  return undefined;
}

export function ancestorEnvironments(
  startPid = process.ppid,
): Record<string, string>[] {
  const collected: Record<string, string>[] = [];
  let pid = startPid;
  const seen = new Set<number>();
  while (pid > 1 && !seen.has(pid)) {
    seen.add(pid);
    try {
      const raw = readFileSync(`/proc/${pid}/environ`);
      collected.push(parseEnvironBuffer(raw));
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
      pid = Number(stat[3]);
    } catch {
      break;
    }
  }
  return collected;
}

export function parseEnvironBuffer(raw: Buffer): Record<string, string> {
  const env: Record<string, string> = {};
  for (const item of raw.toString("utf8").split("\0")) {
    const eq = item.indexOf("=");
    if (eq <= 0) continue;
    env[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return env;
}

export function mergeEnvSources(input: {
  processEnv: NodeJS.Dict<string>;
  ancestorEnvs?: Record<string, string>[];
  existingFile?: Record<string, string>;
  cloudAgent?: boolean;
}): Record<string, string> {
  const processEnv = input.processEnv;
  const ancestors = input.ancestorEnvs ?? [];
  const existing = input.existingFile ?? {};
  const cloud = input.cloudAgent ?? isCloudAgentEnv(processEnv);
  const keys = new Set<string>([
    ...ENV_KEY_ORDER,
    ...cloudSecretNames(processEnv),
    ...Object.keys(existing),
  ]);

  const merged: Record<string, string> = {};
  for (const key of keys) {
    const candidates = [
      processEnv[key],
      ...ancestors.map((env) => env[key]),
      existing[key],
    ];
    const best = pickBestValue(candidates);
    if (best != null) merged[key] = best;
  }

  if (cloud) {
    for (const [key, value] of Object.entries(LOCAL_POSTGRES)) {
      merged[key] = value;
    }
  }

  return merged;
}

export function serializeEnvLocal(values: Record<string, string>): string {
  const keys = [
    ...ENV_KEY_ORDER.filter((key) => key in values),
    ...Object.keys(values)
      .filter((key) => !ENV_KEY_ORDER.includes(key as (typeof ENV_KEY_ORDER)[number]))
      .sort(),
  ];
  const lines: string[] = [
    "# Generated by scripts/sync-env-local.ts. Do not commit.",
    "# Cloud Agent secrets come from process env; local Postgres stays on this VM.",
    "",
  ];
  for (const key of keys) {
    lines.push(`${key}=${encodeEnvValue(values[key]!)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function clerkStatus(values: Record<string, string>): "ok" | "missing" {
  const secret = values.CLERK_SECRET_KEY;
  const publishable = values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretOk =
    isUsableSecretValue(secret) &&
    (secret!.startsWith("sk_test_") || secret!.startsWith("sk_live_"));
  const publishableOk =
    isUsableSecretValue(publishable) &&
    (publishable!.startsWith("pk_test_") || publishable!.startsWith("pk_live_"));
  return secretOk && publishableOk ? "ok" : "missing";
}

export function envForChildProcess(
  fileValues: Record<string, string>,
  processEnv: NodeJS.Dict<string> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(processEnv)) {
    if (value == null) continue;
    if (isPlaceholderValue(value) && isUsableSecretValue(fileValues[key])) {
      env[key] = fileValues[key]!;
      continue;
    }
    if (isPlaceholderValue(value)) continue;
    env[key] = value;
  }
  for (const [key, value] of Object.entries(fileValues)) {
    if (!isUsableSecretValue(env[key]) && isUsableSecretValue(value)) {
      env[key] = value;
    }
  }
  if (isCloudAgentEnv(processEnv)) {
    applyLocalPostgresDefaults(env, processEnv);
  }
  const nodeEnv = processEnv.NODE_ENV ?? process.env.NODE_ENV;
  if (typeof nodeEnv === "string" && !isPlaceholderValue(nodeEnv)) {
    env.NODE_ENV = nodeEnv;
  }
  return env;
}

export type SyncEnvLocalResult = {
  wrote: boolean;
  cloudAgent: boolean;
  clerk: "ok" | "missing";
  path: string;
  keyCount: number;
};

export function syncEnvLocal(options?: {
  cwd?: string;
  processEnv?: NodeJS.Dict<string>;
  ancestorEnvs?: Record<string, string>[];
}): SyncEnvLocalResult {
  const cwd = options?.cwd ?? process.cwd();
  const processEnv = options?.processEnv ?? process.env;
  const path = join(cwd, ".env.local");
  const cloudAgent = isCloudAgentEnv(processEnv);
  const existing = existsSync(path)
    ? parseEnvFile(readFileSync(path, "utf8"))
    : {};

  if (!cloudAgent) {
    return {
      wrote: false,
      cloudAgent,
      clerk: clerkStatus(existing),
      path,
      keyCount: Object.keys(existing).length,
    };
  }

  const merged = mergeEnvSources({
    processEnv,
    ancestorEnvs: options?.ancestorEnvs ?? ancestorEnvironments(),
    existingFile: existing,
    cloudAgent,
  });
  writeFileSync(path, serializeEnvLocal(merged));
  return {
    wrote: true,
    cloudAgent,
    clerk: clerkStatus(merged),
    path,
    keyCount: Object.keys(merged).length,
  };
}

export function applySyncedEnvToProcess(options?: {
  cwd?: string;
  processEnv?: NodeJS.Dict<string>;
  ancestorEnvs?: Record<string, string>[];
}): SyncEnvLocalResult {
  const result = syncEnvLocal(options);
  const processEnv = options?.processEnv ?? process.env;
  const target = processEnv;
  const fileValues = existsSync(result.path)
    ? parseEnvFile(readFileSync(result.path, "utf8"))
    : {};

  for (const [key, value] of Object.entries(target)) {
    if (typeof value === "string" && isPlaceholderValue(value)) {
      delete target[key];
    }
  }
  for (const [key, value] of Object.entries(fileValues)) {
    if (!isUsableSecretValue(value)) continue;
    if (!isUsableSecretValue(target[key])) {
      target[key] = value;
    }
  }
  if (result.cloudAgent || isCloudAgentEnv(target)) {
    applyLocalPostgresDefaults(target as Record<string, string>, processEnv);
  }
  return result;
}

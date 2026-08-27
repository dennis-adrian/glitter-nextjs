import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySyncedEnvToProcess,
  clerkStatus,
  encodeEnvValue,
  envForChildProcess,
  isPlaceholderValue,
  isTestOrCiDatabaseUrl,
  LOCAL_POSTGRES,
  mergeEnvSources,
  parseEnvFile,
  pickBestValue,
  serializeEnvLocal,
} from "@/scripts/lib/sync-env-local";

describe("sync-env-local", () => {
  it("treats invented placeholder keys as unusable", () => {
    expect(isPlaceholderValue("sk_test_placeholder_not_real")).toBe(true);
    expect(isPlaceholderValue("pk_test_placeholder_not_real")).toBe(true);
    expect(isPlaceholderValue("")).toBe(true);
    expect(isPlaceholderValue("sk_test_realishvalue1234567890")).toBe(false);
  });

  it("prefers a real process/parent secret over a placeholder file or shell value", () => {
    expect(
      pickBestValue([
        "sk_test_placeholder_not_real",
        "sk_test_from_parent_process_abc",
        "sk_test_placeholder_not_real",
      ]),
    ).toBe("sk_test_from_parent_process_abc");
  });

  it("never writes placeholder Clerk keys when a real cloud secret exists", () => {
    const merged = mergeEnvSources({
      processEnv: {
        CLOUD_AGENT_ALL_SECRET_NAMES: "CLERK_SECRET_KEY,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        CLERK_SECRET_KEY: "sk_test_placeholder_not_real",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder_not_real",
      },
      ancestorEnvs: [
        {
          CLERK_SECRET_KEY: "sk_test_injected_from_daemon",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_injected_from_daemon",
        },
      ],
      existingFile: {
        CLERK_SECRET_KEY: "sk_test_placeholder_not_real",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder_not_real",
      },
      cloudAgent: true,
    });

    expect(merged.CLERK_SECRET_KEY).toBe("sk_test_injected_from_daemon");
    expect(merged.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
      "pk_test_injected_from_daemon",
    );
    expect(merged.POSTGRES_URL).toContain("glitter_dev");
    expect(serializeEnvLocal(merged)).not.toContain("placeholder");
    expect(clerkStatus(merged)).toBe("ok");
  });

  it("replaces placeholder process env with synced file values for child processes", () => {
    const child = envForChildProcess(
      { CLERK_SECRET_KEY: "sk_test_injected_from_daemon" },
      {
        CLERK_SECRET_KEY: "sk_test_placeholder_not_real",
        PATH: "/usr/bin",
        NODE_ENV: "test",
      },
    );
    expect(child.CLERK_SECRET_KEY).toBe("sk_test_injected_from_daemon");
    expect(child.PATH).toBe("/usr/bin");
    expect(child.NODE_ENV).toBe("test");
  });

  it("forces local Postgres URLs for Cloud Agent child processes", () => {
    const child = envForChildProcess(
      { POSTGRES_URL: "postgres://remote/prod" },
      {
        CLOUD_AGENT_ALL_SECRET_NAMES: "CLERK_SECRET_KEY",
        POSTGRES_URL: "postgres://remote/prod",
        PATH: "/usr/bin",
      },
    );
    expect(child.POSTGRES_URL).toContain("glitter_dev");
    expect(child.TEST_DATABASE_URL).toContain("glitter_test");
    expect(child.PATH).toBe("/usr/bin");
  });

  it("preserves an explicit test/ci POSTGRES_URL override for wrapped migrate", () => {
    const testUrl = LOCAL_POSTGRES.TEST_DATABASE_URL;
    const child = envForChildProcess(
      {
        POSTGRES_URL: LOCAL_POSTGRES.POSTGRES_URL,
        TEST_DATABASE_URL: testUrl,
      },
      {
        CLOUD_AGENT_ALL_SECRET_NAMES: "CLERK_SECRET_KEY",
        // Mirrors `POSTGRES_URL="$TEST_DATABASE_URL" pnpm migrate`
        POSTGRES_URL: testUrl,
        TEST_DATABASE_URL: testUrl,
        PATH: "/usr/bin",
      },
    );

    expect(child.POSTGRES_URL).toBe(testUrl);
    expect(child.POSTGRES_URL).toContain("glitter_test");
    expect(child.POSTGRES_DATABASE).toBe("glitter_test");
    expect(child.TEST_DATABASE_URL).toBe(testUrl);
    expect(isTestOrCiDatabaseUrl(child.POSTGRES_URL)).toBe(true);
  });

  it("does not preserve a non-test/ci POSTGRES_URL override", () => {
    const child = envForChildProcess(
      {},
      {
        CLOUD_AGENT_ALL_SECRET_NAMES: "CLERK_SECRET_KEY",
        POSTGRES_URL: "postgres://glitter:glitter@127.0.0.1:5432/glitter_staging",
        PATH: "/usr/bin",
      },
    );
    expect(child.POSTGRES_URL).toBe(LOCAL_POSTGRES.POSTGRES_URL);
    expect(child.POSTGRES_DATABASE).toBe("glitter_dev");
  });

  it("package.json migrate script still routes through sync-env-local --exec", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.migrate).toBe(
      "tsx scripts/sync-env-local.ts --exec tsx scripts/migrate.ts",
    );
    expect(pkg.scripts["migrate:test"]).toBe(
      'tsx scripts/sync-env-local.ts --exec sh -c \'POSTGRES_URL="$TEST_DATABASE_URL" exec tsx scripts/migrate.ts\'',
    );
  });

  it("parses env files without treating comments as keys", () => {
    const parsed = parseEnvFile(
      "# comment\nCLERK_SECRET_KEY=sk_test_x\n\nNEXT_PUBLIC_BASE_URL=http://localhost:3000\n",
    );
    expect(parsed).toEqual({
      CLERK_SECRET_KEY: "sk_test_x",
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    });
  });

  it("round-trips quotes, backslashes, and newlines via encode/parse", () => {
    const cases = {
      WITH_QUOTES: 'say "hello"',
      WITH_BACKSLASH: "path\\to\\file",
      WITH_NEWLINE: "line1\nline2",
      COMBINED: 'a\\"b\nc',
    };

    const serialized = Object.entries(cases)
      .map(([key, value]) => `${key}=${encodeEnvValue(value)}`)
      .join("\n");

    expect(serialized).toContain('\\"');
    expect(serialized).toContain("\\\\");
    expect(serialized).toContain("\\n");

    expect(parseEnvFile(serialized)).toEqual(cases);
  });

  it("strips placeholder shell values and keeps PATH when applying a synced file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "glitter-env-sync-"));
    writeFileSync(
      join(cwd, ".env.local"),
      "CLERK_SECRET_KEY=sk_test_placeholder_not_real\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder_not_real\n",
    );
    const processEnv: NodeJS.Dict<string> = {
      CLOUD_AGENT_ALL_SECRET_NAMES:
        "CLERK_SECRET_KEY,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      CLERK_SECRET_KEY: "sk_test_placeholder_not_real",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder_not_real",
      PATH: "/usr/bin",
    };

    const result = applySyncedEnvToProcess({
      cwd,
      processEnv,
      ancestorEnvs: [
        {
          CLERK_SECRET_KEY: "sk_test_injected_from_daemon",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_injected_from_daemon",
        },
      ],
    });

    expect(result.wrote).toBe(true);
    expect(result.clerk).toBe("ok");
    expect(processEnv.CLERK_SECRET_KEY).toBe("sk_test_injected_from_daemon");
    expect(processEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
      "pk_test_injected_from_daemon",
    );
    expect(processEnv.PATH).toBe("/usr/bin");
    expect(processEnv.POSTGRES_URL).toContain("glitter_dev");
    expect(readFileSync(join(cwd, ".env.local"), "utf8")).not.toContain(
      "placeholder",
    );
  });
});

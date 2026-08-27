import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySyncedEnvToProcess,
  clerkStatus,
  envForChildProcess,
  isPlaceholderValue,
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
      { CLERK_SECRET_KEY: "sk_test_placeholder_not_real", PATH: "/usr/bin" },
    );
    expect(child.CLERK_SECRET_KEY).toBe("sk_test_injected_from_daemon");
    expect(child.PATH).toBe("/usr/bin");
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

  it("parses env files without treating comments as keys", () => {
    const parsed = parseEnvFile(
      "# comment\nCLERK_SECRET_KEY=sk_test_x\n\nNEXT_PUBLIC_BASE_URL=http://localhost:3000\n",
    );
    expect(parsed).toEqual({
      CLERK_SECRET_KEY: "sk_test_x",
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    });
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

// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = {
  CLERK_SECRET_KEY: "sk_test_env",
  POSTGRES_URL: "postgres://user:pass@localhost:5432/glitter_test",
  RESEND_API_KEY: "re_test",
  UPLOADTHING_TOKEN: "ut_test",
};

async function loadEnv(extra: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...extra })) {
    vi.stubEnv(key, value);
  }
  return (await import("@/env")).serverEnv;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RESEND_WEBHOOK_SECRET", () => {
  it("is optional, and an empty value copied from .env.example counts as unset", async () => {
    expect(
      (await loadEnv({ RESEND_WEBHOOK_SECRET: "" })).RESEND_WEBHOOK_SECRET,
    ).toBeUndefined();
  });

  it("is read when set", async () => {
    expect(
      (await loadEnv({ RESEND_WEBHOOK_SECRET: "whsec_abc" }))
        .RESEND_WEBHOOK_SECRET,
    ).toBe("whsec_abc");
  });
});

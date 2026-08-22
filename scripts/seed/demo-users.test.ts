import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEED_DEMO_PASSWORD,
  DEMO_USERS,
  getDevSeedGate,
  resolveSeedDemoPassword,
} from "./demo-users";

describe("getDevSeedGate", () => {
  it("allows development clerk secrets outside production", () => {
    expect(
      getDevSeedGate({
        CLERK_SECRET_KEY: "sk_test_abc",
        VERCEL_ENV: "development",
        NODE_ENV: "development",
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks live clerk secrets", () => {
    const result = getDevSeedGate({
      CLERK_SECRET_KEY: "sk_live_abc",
      VERCEL_ENV: "development",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/live/i);
    }
  });

  it("blocks production runtimes", () => {
    const result = getDevSeedGate({
      CLERK_SECRET_KEY: "sk_test_abc",
      VERCEL_ENV: "production",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks when ALLOW_DEV_SEED=false", () => {
    const result = getDevSeedGate({
      CLERK_SECRET_KEY: "sk_test_abc",
      VERCEL_ENV: "development",
      ALLOW_DEV_SEED: "false",
    });
    expect(result.allowed).toBe(false);
  });
});

describe("resolveSeedDemoPassword", () => {
  it("uses SEED_DEMO_PASSWORD when set", () => {
    expect(resolveSeedDemoPassword({ SEED_DEMO_PASSWORD: "Custom-Pass-1!" })).toBe(
      "Custom-Pass-1!",
    );
  });

  it("falls back to the documented default", () => {
    expect(resolveSeedDemoPassword({})).toBe(DEFAULT_SEED_DEMO_PASSWORD);
  });
});

describe("DEMO_USERS", () => {
  it("uses Clerk test email subaddresses", () => {
    for (const user of DEMO_USERS) {
      expect(user.email).toContain("+clerk_test@");
    }
  });

  it("includes an admin account", () => {
    expect(DEMO_USERS.some((user) => user.role === "admin")).toBe(true);
  });
});

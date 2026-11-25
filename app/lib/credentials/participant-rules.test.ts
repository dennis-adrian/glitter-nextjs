// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CREDENTIAL_RULES } from "@/app/lib/credentials/definitions";

const isFeatureLaunched = vi.hoisted(() => vi.fn());
const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const select = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({ isFeatureLaunched }));
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      select(...args);
      return { from: () => ({ where: async () => rows.value }) };
    },
  },
}));

describe("fetchParticipantCredentialRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.value = [{ group: "gastronomy", quantity: 3, namingMode: "all_named" }];
  });

  it("gives the defaults, without reading rules, until the flag is public", async () => {
    isFeatureLaunched.mockResolvedValue(false);
    const { fetchParticipantCredentialRules } = await import(
      "@/app/lib/credentials/participant-rules"
    );
    expect(await fetchParticipantCredentialRules(1)).toEqual(DEFAULT_CREDENTIAL_RULES);
    expect(select).not.toHaveBeenCalled();
  });

  it("gives the festival's rules once the flag is public", async () => {
    isFeatureLaunched.mockResolvedValue(true);
    const { fetchParticipantCredentialRules } = await import(
      "@/app/lib/credentials/participant-rules"
    );
    const rules = await fetchParticipantCredentialRules(1);
    expect(rules.gastronomy).toEqual({ quantity: 3, namingMode: "all_named" });
    expect(rules.illustration).toEqual(DEFAULT_CREDENTIAL_RULES.illustration);
  });
});

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CREDENTIAL_RULES } from "@/app/lib/credentials/definitions";

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const select = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
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
  });

  it("gives the festival's own rules over the defaults", async () => {
    rows.value = [{ group: "gastronomy", quantity: 3, namingMode: "all_named" }];
    const { fetchParticipantCredentialRules } = await import(
      "@/app/lib/credentials/participant-rules"
    );
    const rules = await fetchParticipantCredentialRules(1);
    expect(rules.gastronomy).toEqual({ quantity: 3, namingMode: "all_named" });
    expect(rules.illustration).toEqual(DEFAULT_CREDENTIAL_RULES.illustration);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("gives exactly the defaults to a festival without rules", async () => {
    rows.value = [];
    const { fetchParticipantCredentialRules } = await import(
      "@/app/lib/credentials/participant-rules"
    );
    expect(await fetchParticipantCredentialRules(2)).toEqual(DEFAULT_CREDENTIAL_RULES);
  });
});

import { describe, expect, it } from "vitest";

import { InfractionSearchParamsSchema } from "@/app/dashboard/infractions/schemas";
import { searchInfractionUsersSchema } from "@/app/lib/infractions/schema";

describe("InfractionSearchParamsSchema", () => {
  it("applies stable pagination and ordering defaults", () => {
    const result = InfractionSearchParamsSchema.parse({});

    expect(result).toMatchObject({
      query: "",
      limit: 25,
      offset: 0,
      sort: "createdAt",
      direction: "desc",
    });
  });

  it("accepts only explicit boolean query values", () => {
    expect(
      InfractionSearchParamsSchema.parse({ hasSanction: "false" }).hasSanction,
    ).toBe(false);
    expect(
      InfractionSearchParamsSchema.safeParse({ hasSanction: "anything" })
        .success,
    ).toBe(false);
  });

  it("rejects malformed and impossible calendar dates", () => {
    expect(
      InfractionSearchParamsSchema.safeParse({ createdFrom: "not-a-date" })
        .success,
    ).toBe(false);
    expect(
      InfractionSearchParamsSchema.safeParse({ createdFrom: "2026-02-30" })
        .success,
    ).toBe(false);
  });

  it("rejects an inverted creation date range", () => {
    const result = InfractionSearchParamsSchema.safeParse({
      createdFrom: "2026-07-22",
      createdTo: "2026-07-21",
    });

    expect(result.success).toBe(false);
  });

  it("restricts page sizes to the infractions allowlist", () => {
    expect(
      InfractionSearchParamsSchema.safeParse({ limit: "100" }).success,
    ).toBe(true);
    expect(
      InfractionSearchParamsSchema.safeParse({ limit: "200" }).success,
    ).toBe(false);
  });
});

describe("searchInfractionUsersSchema", () => {
  it("trims the query and bounds the result limit", () => {
    expect(
      searchInfractionUsersSchema.parse({ query: "  Ana  ", limit: 8 }),
    ).toEqual({ query: "Ana", limit: 8 });
    expect(
      searchInfractionUsersSchema.safeParse({ query: "Ana", limit: 21 })
        .success,
    ).toBe(false);
  });
});

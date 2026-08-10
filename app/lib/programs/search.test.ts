import { describe, expect, it } from "vitest";

import {
  buildSearchPattern,
  escapeLikePattern,
  ticketMatchesQuery,
  type SearchableTicket,
} from "@/app/lib/programs/search";

function ticket(overrides: Partial<SearchableTicket> = {}): SearchableTicket {
  return {
    attendeeName: "María Fernández",
    attendeeEmail: "maria@example.com",
    code: "HcE7xK2mQp9rTn4vYw1zLa",
    ...overrides,
  };
}

describe("escapeLikePattern", () => {
  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("maria lopez")).toBe("maria lopez");
  });

  it("neutralizes the single-character wildcard", () => {
    // Real addresses contain underscores; unescaped it matches any character.
    expect(escapeLikePattern("maria_lopez@x.com")).toBe("maria\\_lopez@x.com");
  });

  it("neutralizes the multi-character wildcard", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
  });

  it("escapes a backslash without re-escaping its replacement", () => {
    // One pass over the input: `\` becomes `\\`, not `\\\\`.
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
  });
});

describe("buildSearchPattern", () => {
  it("wraps the escaped value in contains-wildcards", () => {
    expect(buildSearchPattern("ana")).toBe("%ana%");
  });

  it("keeps the caller's wildcards literal while adding its own", () => {
    expect(buildSearchPattern("%")).toBe("%\\%%");
  });
});

describe("ticketMatchesQuery", () => {
  it("matches on attendee name, case-insensitively", () => {
    expect(ticketMatchesQuery(ticket(), "fernández")).toBe(true);
    expect(ticketMatchesQuery(ticket(), "MARÍA")).toBe(true);
  });

  it("matches on email and on ticket code", () => {
    expect(ticketMatchesQuery(ticket(), "maria@example")).toBe(true);
    expect(ticketMatchesQuery(ticket(), "HcE7xK2")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(ticketMatchesQuery(ticket(), "carlos")).toBe(false);
  });

  it("never matches on empty or blank input", () => {
    expect(ticketMatchesQuery(ticket(), "")).toBe(false);
    expect(ticketMatchesQuery(ticket(), "   ")).toBe(false);
  });
});

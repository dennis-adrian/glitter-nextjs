import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchTerms, getEligibility, findMemberships } = vi.hoisted(() => ({
  fetchTerms: vi.fn(),
  getEligibility: vi.fn(),
  findMemberships: vi.fn(),
}));

vi.mock("@/app/lib/festival-terms/queries", () => ({
  fetchPublishedFestivalTermsVersion: fetchTerms,
}));
vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: getEligibility,
}));
vi.mock("@/db", () => ({
  db: { query: { reservationParticipants: { findMany: findMemberships } } },
}));

import {
  getSelfServicePageDenial,
  PRE_READ_CODES,
} from "@/app/lib/reservations/entry";

const OPENS_AT = new Date("2026-11-07T00:00:00.000Z");
const OPEN = new Date("2026-11-07T00:00:01.000Z");
const BEFORE_OPEN = new Date("2026-11-06T23:00:00.000Z");

type Input = Parameters<typeof getSelfServicePageDenial>[0];

function input(overrides: Partial<Input> = {}): Input {
  return {
    actor: { id: 3, role: "user" },
    targetProfile: {
      id: 3,
      status: "verified",
      userRequests: [
        {
          festivalId: 10,
          type: "festival_participation",
          status: "accepted",
          termsVersionId: 1,
        },
      ],
    },
    festival: {
      id: 10,
      status: "active",
      reservationsStartDate: OPENS_AT,
      participantTermsEnabled: true,
    },
    now: OPEN,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function readsReturn(
  options: {
    eligibility?: unknown;
    memberships?: unknown[];
    termsId?: number | null;
  } = {},
) {
  fetchTerms.mockResolvedValue(
    options.termsId === null ? null : { id: options.termsId ?? 1 },
  );
  getEligibility.mockResolvedValue(options.eligibility ?? { eligible: true });
  findMemberships.mockResolvedValue(options.memberships ?? []);
}

const readCalls = () =>
  fetchTerms.mock.calls.length +
  getEligibility.mock.calls.length +
  findMemberships.mock.calls.length;

afterEach(() => {
  vi.resetAllMocks();
});

describe("getSelfServicePageDenial", () => {
  it("starts all three reads before any of them answers", async () => {
    const terms = deferred<{ id: number }>();
    const eligibility = deferred<{ eligible: true }>();
    const memberships = deferred<unknown[]>();
    fetchTerms.mockReturnValue(terms.promise);
    getEligibility.mockReturnValue(eligibility.promise);
    findMemberships.mockReturnValue(memberships.promise);

    const pending = getSelfServicePageDenial(input());
    await Promise.resolve();

    expect(fetchTerms).toHaveBeenCalledTimes(1);
    expect(getEligibility).toHaveBeenCalledTimes(1);
    expect(findMemberships).toHaveBeenCalledTimes(1);

    terms.resolve({ id: 1 });
    eligibility.resolve({ eligible: true });
    memberships.resolve([]);
    await expect(pending).resolves.toBeNull();
  });

  it("skips the terms read when the festival has no participant terms", async () => {
    readsReturn();
    const denial = await getSelfServicePageDenial(
      input({
        festival: {
          id: 10,
          status: "active",
          reservationsStartDate: OPENS_AT,
          participantTermsEnabled: false,
        },
      }),
    );
    expect(fetchTerms).not.toHaveBeenCalled();
    expect(denial).toEqual({ code: "TERMS_UNAVAILABLE" });
  });

  it("carries the sanction on SANCTION_BLOCKED", async () => {
    const block = { eligible: false, reason: "ban" };
    readsReturn({ eligibility: block });
    await expect(getSelfServicePageDenial(input())).resolves.toEqual({
      code: "SANCTION_BLOCKED",
      sanctionBlock: block,
    });
  });

  it("denies a live self-service reservation", async () => {
    readsReturn({
      memberships: [
        {
          reservation: {
            festivalId: 10,
            status: "pending",
            source: "user_reservation",
          },
        },
      ],
    });
    await expect(getSelfServicePageDenial(input())).resolves.toEqual({
      code: "ALREADY_RESERVED",
    });
  });

  describe("returns without a single read when the answer cannot depend on one", () => {
    it.each<[string, Partial<Input>]>([
      ["UNAUTHENTICATED", { actor: null }],
      ["UNAUTHORIZED", { actor: { id: 8, role: "user" } }],
      [
        "PROFILE_NOT_VERIFIED",
        {
          targetProfile: { id: 3, status: "pending", userRequests: [] },
        },
      ],
      [
        "FESTIVAL_NOT_ACTIVE",
        {
          festival: {
            id: 10,
            status: "draft",
            reservationsStartDate: OPENS_AT,
            participantTermsEnabled: true,
          },
        },
      ],
      ["RESERVATIONS_NOT_OPEN", { now: BEFORE_OPEN }],
    ])("%s", async (code, overrides) => {
      readsReturn();
      await expect(getSelfServicePageDenial(input(overrides))).resolves.toEqual(
        { code },
      );
      expect(PRE_READ_CODES.has(code as never)).toBe(true);
      expect(readCalls()).toBe(0);
    });
  });

  describe("at the opening instant", () => {
    it("is null when only the clock was in the way", async () => {
      readsReturn();
      await expect(
        getSelfServicePageDenial(input({ now: OPENS_AT })),
      ).resolves.toBeNull();
    });

    it("still says NOT_ENROLLED without an enrollment", async () => {
      readsReturn();
      await expect(
        getSelfServicePageDenial(
          input({
            now: OPENS_AT,
            targetProfile: { id: 3, status: "verified", userRequests: [] },
          }),
        ),
      ).resolves.toEqual({ code: "NOT_ENROLLED" });
    });
  });
});

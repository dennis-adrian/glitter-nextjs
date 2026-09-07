import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

vi.mock("@/app/lib/reservations/tx-eligibility", () => ({
  denySelfServiceMutation: vi.fn().mockResolvedValue(null),
}));

const fetchPublishedFestivalTermsVersion = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: 1 }),
);

vi.mock("@/app/lib/festival-terms/queries", () => ({
  fetchPublishedFestivalTermsVersion,
}));

vi.mock("@/app/lib/sanctions/reservation-eligibility", () => ({
  getReservationEligibility: vi.fn().mockResolvedValue({
    eligible: true,
    message: "",
  }),
}));

import {
  assertReservationPartner,
  hasTooManyRegisteredParticipants,
  isAllowedReservationPartnerRole,
  isIllustrationParticipantCategory,
  sharingAllowedForStandCategory,
} from "@/app/lib/reservations/partner-eligibility";
import { festivals, reservationParticipants, userRequests, users } from "@/db/schema";

function adminPartnerTx(options: {
  ownerCategory?: string;
  partner?: {
    status?: string;
    category?: string;
    role?: string;
  };
  enrollment?: {
    type?: string;
    status?: string;
    termsVersionId?: number | null;
  } | null;
  festival?: { participantTermsEnabled: boolean } | null;
  alreadyReserved?: boolean;
}) {
  let userReads = 0;
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () =>
              options.alreadyReserved ? [{ reservationId: 1 }] : [],
          }),
        }),
        where: () => ({
          limit: async () => {
            if (table === users) {
              userReads += 1;
              if (userReads === 1) {
                return [{ category: options.ownerCategory ?? "illustration" }];
              }
              return [
                {
                  id: 4,
                  status: options.partner?.status ?? "verified",
                  category: options.partner?.category ?? "illustration",
                  role: options.partner?.role ?? "user",
                },
              ];
            }
            if (table === userRequests) {
              if (options.enrollment === null) return [];
              return [
                {
                  type: options.enrollment?.type ?? "festival_participation",
                  status: options.enrollment?.status ?? "accepted",
                  termsVersionId: options.enrollment?.termsVersionId ?? 1,
                },
              ];
            }
            if (table === festivals) {
              if (options.festival === null) return [];
              return [
                {
                  participantTermsEnabled:
                    options.festival?.participantTermsEnabled ?? true,
                },
              ];
            }
            if (table === reservationParticipants) {
              return [];
            }
            return [];
          },
        }),
      }),
    })),
  };
}

describe("partner eligibility helpers", () => {
  it("allows illustration sharing including the legacy new_artist alias", () => {
    expect(sharingAllowedForStandCategory("illustration")).toBe(true);
    expect(sharingAllowedForStandCategory("new_artist")).toBe(true);
    expect(sharingAllowedForStandCategory("gastronomy")).toBe(false);
    expect(sharingAllowedForStandCategory("entrepreneurship")).toBe(false);
    expect(isIllustrationParticipantCategory("new_artist")).toBe(true);
    expect(isIllustrationParticipantCategory("gastronomy")).toBe(false);
  });

  it("allows only participant roles", () => {
    expect(isAllowedReservationPartnerRole("user")).toBe(true);
    expect(isAllowedReservationPartnerRole("artist")).toBe(true);
    expect(isAllowedReservationPartnerRole("admin")).toBe(false);
    expect(isAllowedReservationPartnerRole("festival_admin")).toBe(false);
  });

  it("caps registered participants at two", () => {
    expect(hasTooManyRegisteredParticipants([1, 2])).toBe(false);
    expect(hasTooManyRegisteredParticipants([1, 2, 3])).toBe(true);
  });
});

describe("assertReservationPartner", () => {
  const actor = { id: 9, role: "admin" as const };
  const adminInput = {
    festivalId: 10,
    ownerUserId: 3,
    partnerUserId: 4,
    standCategory: "illustration",
    existingParticipantUserIds: [3],
    mode: "admin" as const,
    actor,
  };

  beforeEach(() => {
    fetchPublishedFestivalTermsVersion.mockReset();
    fetchPublishedFestivalTermsVersion.mockResolvedValue({ id: 1 });
  });

  it("rejects the owner as their own partner without querying", async () => {
    const tx = { select: vi.fn() };
    const result = await assertReservationPartner(tx as never, {
      festivalId: 10,
      ownerUserId: 3,
      partnerUserId: 3,
      standCategory: "illustration",
      existingParticipantUserIds: [3],
      mode: "admin",
      actor,
    });
    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
    expect(tx.select).not.toHaveBeenCalled();
  });

  it("rejects partners on non-illustration stands", async () => {
    const tx = { select: vi.fn() };
    const result = await assertReservationPartner(tx as never, {
      festivalId: 10,
      ownerUserId: 3,
      partnerUserId: 4,
      standCategory: "gastronomy",
      existingParticipantUserIds: [3],
      mode: "self_service",
      actor: { id: 3, role: "user" },
    });
    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
    expect(tx.select).not.toHaveBeenCalled();
  });

  it("rejects a gastronomy partner on an illustration reservation", async () => {
    let userReads = 0;
    const tx = {
      select: vi.fn(() => ({
        from: (table: unknown) => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
          where: () => ({
            limit: async () => {
              if (table === users) {
                userReads += 1;
                if (userReads === 1) {
                  return [{ category: "illustration" }];
                }
                return [
                  {
                    id: 4,
                    status: "verified",
                    category: "gastronomy",
                    role: "user",
                  },
                ];
              }
              if (table === userRequests) {
                return [
                  {
                    type: "festival_participation",
                    status: "accepted",
                    termsVersionId: 1,
                  },
                ];
              }
              if (table === reservationParticipants) {
                return [];
              }
              return [];
            },
          }),
        }),
      })),
    };

    const result = await assertReservationPartner(tx as never, {
      festivalId: 10,
      ownerUserId: 3,
      partnerUserId: 4,
      standCategory: "illustration",
      existingParticipantUserIds: [3],
      mode: "admin",
      actor,
    });
    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
  });

  it("rejects a third registered participant", async () => {
    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ category: "illustration" }],
          }),
        }),
      })),
    };
    const result = await assertReservationPartner(tx as never, {
      festivalId: 10,
      ownerUserId: 3,
      partnerUserId: 6,
      standCategory: "illustration",
      existingParticipantUserIds: [3, 5],
      reservationId: 9,
      mode: "admin",
      actor,
    });
    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
  });

  it("allows an otherwise eligible admin partner when participant terms are disabled", async () => {
    const tx = adminPartnerTx({
      festival: { participantTermsEnabled: false },
      enrollment: {
        type: "festival_participation",
        status: "accepted",
        termsVersionId: null,
      },
    });

    const result = await assertReservationPartner(tx as never, adminInput);

    expect(result).toBeNull();
    expect(fetchPublishedFestivalTermsVersion).not.toHaveBeenCalled();
  });

  it("rejects an admin partner when terms are enabled and the accepted version is stale", async () => {
    fetchPublishedFestivalTermsVersion.mockResolvedValue({ id: 7 });
    const tx = adminPartnerTx({
      festival: { participantTermsEnabled: true },
      enrollment: {
        type: "festival_participation",
        status: "accepted",
        termsVersionId: 1,
      },
    });

    const result = await assertReservationPartner(tx as never, adminInput);

    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
    expect(fetchPublishedFestivalTermsVersion).toHaveBeenCalled();
  });

  it("allows an admin partner when terms are enabled and the accepted version matches", async () => {
    fetchPublishedFestivalTermsVersion.mockResolvedValue({ id: 7 });
    const tx = adminPartnerTx({
      festival: { participantTermsEnabled: true },
      enrollment: {
        type: "festival_participation",
        status: "accepted",
        termsVersionId: 7,
      },
    });

    const result = await assertReservationPartner(tx as never, adminInput);

    expect(result).toBeNull();
    expect(fetchPublishedFestivalTermsVersion).toHaveBeenCalled();
  });
});

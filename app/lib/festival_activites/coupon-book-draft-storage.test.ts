import { describe, expect, it } from "vitest";

import { buildInitialCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";
import { resolveStoredDraftAgainstServer } from "@/app/lib/festival_activites/coupon-book-draft-storage";

const sampleVariants = [
  {
    detailId: 10,
    detailLabel: "Variante A",
    headerImageUrl: null,
    entries: [
      {
        participationId: 1,
        participantName: "Alpha",
        standLabels: ["A1"],
        sectorName: null,
        promoHighlight: "",
        promoDescription: "Promo",
        promoConditions: null,
        imageUrl: null,
        proofStatus: "approved" as const,
      },
    ],
  },
];

describe("resolveStoredDraftAgainstServer", () => {
  it("prefers server draft when server revision is newer", () => {
    const serverDraft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    serverDraft.savedRevision = 3;
    serverDraft.updatedAt = "2026-01-02T00:00:00.000Z";

    const localDraft = {
      ...serverDraft,
      savedRevision: 2,
      updatedAt: "2026-01-03T00:00:00.000Z",
      globalSettings: {
        ...serverDraft.globalSettings,
        dynamicCouponsPerPage: 5,
      },
    };

    expect(
      resolveStoredDraftAgainstServer(
        localDraft,
        serverDraft,
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe(serverDraft);
  });

  it("keeps local unsaved edits on the same revision", () => {
    const serverDraft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    serverDraft.savedRevision = 2;
    serverDraft.updatedAt = "2026-01-02T00:00:00.000Z";

    const localDraft = {
      ...serverDraft,
      updatedAt: "2026-01-03T00:00:00.000Z",
      globalSettings: {
        ...serverDraft.globalSettings,
        dynamicCouponsPerPage: 5,
      },
    };

    expect(
      resolveStoredDraftAgainstServer(
        localDraft,
        serverDraft,
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe(localDraft);
  });
});

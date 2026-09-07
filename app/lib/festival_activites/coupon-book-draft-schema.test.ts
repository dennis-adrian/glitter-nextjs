import { describe, expect, it } from "vitest";

import { buildInitialCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";
import { CouponBookDraftSchema } from "@/app/lib/festival_activites/coupon-book-draft-schema";

const sampleVariants = [
  {
    detailId: 10,
    detailLabel: "Variante A",
    headerImageUrl: null,
    participationLimit: null,
    entries: [
      {
        participationId: 1,
        participantName: "Alpha",
        standLabels: ["A1"],
        sectorName: "Norte",
        promoHighlight: "2x1",
        promoDescription: "Promo alpha",
        promoConditions: "Hasta agotar stock",
        imageUrl: null,
        proofStatus: "approved" as const,
      },
    ],
  },
];

describe("CouponBookDraftSchema", () => {
  it("accepts drafts with matching entry and page keys", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });

    expect(CouponBookDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects entry records whose keys do not match entry.id", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const participantId = "participant-1";
    const entry = draft.entries[participantId];
    const mismatched = {
      ...draft,
      entries: {
        ...draft.entries,
        [participantId]: { ...entry, id: "different-id" },
      },
    };

    const result = CouponBookDraftSchema.safeParse(mismatched);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["entries", participantId, "id"],
          message: `Entry key "${participantId}" does not match entry id "different-id"`,
        }),
      ]),
    );
  });

  it("rejects books with no page references", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const invalid = {
      ...draft,
      books: [{ ...draft.books[0], pageIds: [] }],
    };

    expect(CouponBookDraftSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects page records whose keys do not match page.id", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const pageId = draft.books[0].pageIds[0];
    const page = draft.pages[pageId];
    const mismatched = {
      ...draft,
      pages: {
        ...draft.pages,
        [pageId]: { ...page, id: "different-page-id" },
      },
    };

    const result = CouponBookDraftSchema.safeParse(mismatched);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["pages", pageId, "id"],
          message: `Page key "${pageId}" does not match page id "different-page-id"`,
        }),
      ]),
    );
  });
});

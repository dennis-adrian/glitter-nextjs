import { describe, expect, it } from "vitest";

import {
  buildInitialCouponBookDraft,
  countCouponVisibility,
  countEmptySlotsOnPage,
  draftPageToCouponBookPage,
  getDraftBookPages,
  mergeDraftWithSource,
  mergeLayoutWithOverride,
  moveCouponBetweenPages,
  reflowDraftPages,
  restoreDraftCouponFromSource,
  setParticipantInclusionMode,
  updateDraftCouponEntry,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { isCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";
import { DEFAULT_COUPON_TEXT_LAYOUT_CONFIG } from "@/app/lib/festival_activites/coupon-book-builder";

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
        sectorName: "Norte",
        promoHighlight: "2x1",
        promoDescription: "Promo alpha",
        promoConditions: "Hasta agotar stock",
        imageUrl: null,
        proofStatus: "approved" as const,
      },
      {
        participationId: 2,
        participantName: "Beta",
        standLabels: ["B2"],
        sectorName: "Sur",
        promoHighlight: "",
        promoDescription: "Promo beta",
        promoConditions: null,
        imageUrl: null,
        proofStatus: "pending_review" as const,
      },
    ],
  },
];

describe("coupon-book-draft", () => {
  it("builds an initial draft with courtesy coupon and books", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });

    expect(draft.books).toHaveLength(1);
    expect(draft.entries[draft.courtesyCouponId]?.type).toBe("courtesy");
    expect(Object.keys(draft.entries)).toHaveLength(3);
    expect(getDraftBookPages(draft, draft.books[0].id)).toHaveLength(1);
  });

  it("respects participant inclusion mode counts", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
      participantInclusionMode: "approved_only",
    });
    expect(countCouponVisibility(draft)).toEqual({ included: 1, hidden: 1 });

    const expanded = setParticipantInclusionMode(draft, "approved_and_pending");
    expect(countCouponVisibility(expanded)).toEqual({
      included: 2,
      hidden: 0,
    });
  });

  it("updates coupon content without touching source snapshot", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const updated = updateDraftCouponEntry(draft, "participant-1", {
      participantName: "Alpha Editada",
    });
    expect(updated.entries["participant-1"].participantName).toBe(
      "Alpha Editada",
    );
    expect(
      updated.entries["participant-1"].sourceSnapshot?.participantName,
    ).toBe("Alpha");
  });

  it("restores participant coupon content from source snapshot", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const edited = updateDraftCouponEntry(draft, "participant-1", {
      participantName: "Temporal",
    });
    const restored = restoreDraftCouponFromSource(edited, "participant-1");
    expect(restored.entries["participant-1"].participantName).toBe("Alpha");
  });

  it("reflows pages when dynamic coupons per page changes", () => {
    const manyEntries = Array.from({ length: 30 }, (_, index) => ({
      participationId: index + 100,
      participantName: `P${index + 1}`,
      standLabels: [],
      sectorName: null,
      promoHighlight: "",
      promoDescription: `Promo ${index + 1}`,
      promoConditions: null,
      imageUrl: null,
      proofStatus: "approved" as const,
    }));
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: [
        {
          detailId: 99,
          detailLabel: "Grande",
          headerImageUrl: null,
          entries: manyEntries,
        },
      ],
      dynamicCouponsPerPage: 26,
    });
    expect(getDraftBookPages(draft, draft.books[0].id).length).toBeGreaterThan(
      1,
    );

    const reflowed = reflowDraftPages(draft, 10);
    expect(reflowed.globalSettings.dynamicCouponsPerPage).toBe(10);
    expect(getDraftBookPages(reflowed, reflowed.books[0].id).length).toBe(3);
  });

  it("reflows pages when participant inclusion mode narrows", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
      dynamicCouponsPerPage: 1,
    });
    expect(getDraftBookPages(draft, draft.books[0].id)).toHaveLength(2);

    const narrowed = setParticipantInclusionMode(draft, "approved_only");
    const reflowed = reflowDraftPages(
      narrowed,
      narrowed.globalSettings.dynamicCouponsPerPage,
      sampleVariants,
    );
    const pages = getDraftBookPages(reflowed, reflowed.books[0].id);
    expect(pages).toHaveLength(1);
    expect(pages[0].slotCouponIds[0]).toBe("participant-1");
  });

  it("counts hidden participants as empty slots", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
      dynamicCouponsPerPage: 2,
    });
    const narrowed = reflowDraftPages(
      setParticipantInclusionMode(draft, "approved_only"),
      2,
      sampleVariants,
    );
    const page = getDraftBookPages(narrowed, narrowed.books[0].id)[0];
    expect(countEmptySlotsOnPage(narrowed, page)).toBe(1);
  });

  it("sets totalPages from the book page count", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
      dynamicCouponsPerPage: 1,
    });
    const pages = getDraftBookPages(draft, draft.books[0].id);
    expect(draftPageToCouponBookPage(draft, pages[1]).totalPages).toBe(2);
  });

  it("rejects malformed nested draft data", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const malformed = {
      ...draft,
      pages: {
        ...draft.pages,
        [Object.keys(draft.pages)[0]]: {
          ...Object.values(draft.pages)[0],
          slotCouponIds: ["missing-participant"],
        },
      },
    };
    expect(isCouponBookDraft(malformed)).toBe(false);
  });

  it("merges participant changes from source while preserving overrides", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const withOverride = updateDraftCouponEntry(draft, "participant-1", {
      layoutOverride: { standFontSizeMm: 4 },
      participantName: "Nombre local",
    });
    const sourceDraft = updateDraftCouponEntry(draft, "participant-1", {
      participantName: "Nombre fuente",
    });
    const merged = mergeDraftWithSource(withOverride, sourceDraft, sampleVariants);
    expect(merged.entries["participant-1"].participantName).toBe(
      "Nombre fuente",
    );
    expect(merged.entries["participant-1"].layoutOverride).toEqual({
      standFontSizeMm: 4,
    });
  });

  it("moves coupons between pages in draft only", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
      dynamicCouponsPerPage: 1,
    });
    const pages = getDraftBookPages(draft, draft.books[0].id);
    expect(pages.length).toBe(2);
    const moved = moveCouponBetweenPages({
      draft,
      couponId: "participant-2",
      targetPageId: pages[0].id,
    });
    const firstPage = getDraftBookPages(moved, moved.books[0].id)[0];
    const secondPage = getDraftBookPages(moved, moved.books[0].id)[1];
    expect(firstPage.slotCouponIds[0]).toBe("participant-2");
    expect(secondPage.slotCouponIds[0]).toBe("participant-1");
  });

  it("merges per-coupon layout overrides on top of global template", () => {
    const merged = mergeLayoutWithOverride(DEFAULT_COUPON_TEXT_LAYOUT_CONFIG, {
      standFontSizeMm: 3.3,
      nameBox: { yPct: 12 },
    });
    expect(merged.standFontSizeMm).toBe(3.3);
    expect(merged.nameBox.yPct).toBe(12);
    expect(merged.sectorFontSizeMm).toBe(
      DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.sectorFontSizeMm,
    );
  });

  it("renders draft pages using courtesy coupon from draft", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: sampleVariants,
    });
    const editedCourtesy = updateDraftCouponEntry(
      draft,
      draft.courtesyCouponId,
      {
        participantName: "Cortesía Custom",
      },
    );
    const page = getDraftBookPages(
      editedCourtesy,
      editedCourtesy.books[0].id,
    )[0];
    const rendered = draftPageToCouponBookPage(editedCourtesy, page);
    expect(rendered.headerDynamicEntry?.participantName).toBe("Alpha");
    expect(editedCourtesy.entries[draft.courtesyCouponId].participantName).toBe(
      "Cortesía Custom",
    );
  });
});

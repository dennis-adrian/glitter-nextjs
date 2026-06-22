import { describe, expect, it } from "vitest";

import { buildInitialCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft";
import {
  loadStoredCouponBookEditorState,
  resolveStoredDraftAgainstServer,
} from "@/app/lib/festival_activites/coupon-book-draft-storage";

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

describe("loadStoredCouponBookEditorState legacy layout migration", () => {
  const festivalId = 1;
  const activityId = 2;
  const legacyKey = `couponbook-layout:v1:festival:${festivalId}:activity:${activityId}`;
  const draftKey = `couponbook-draft:v2:festival:${festivalId}:activity:${activityId}`;

  const fallbackDraft = buildInitialCouponBookDraft({
    festivalId,
    activityId,
    variants: sampleVariants,
  });

  it("applies valid legacy layout settings from localStorage", () => {
    const customLayout = {
      ...fallbackDraft.globalSettings.globalLayout,
      headerImageScalePct: 88,
    };
    const customPdfCanvas = {
      ...fallbackDraft.globalSettings.pdfCanvas,
      widthCm: 22,
    };

    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        textLayoutConfig: customLayout,
        pdfCanvasConfig: customPdfCanvas,
      }),
    );

    const { draft } = loadStoredCouponBookEditorState(
      festivalId,
      activityId,
      fallbackDraft,
    );

    expect(draft.globalSettings.globalLayout).toEqual(customLayout);
    expect(draft.globalSettings.pdfCanvas).toEqual(customPdfCanvas);
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(draftKey);
  });

  it("falls back when legacy layout settings fail schema validation", () => {
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        textLayoutConfig: { headerImageScalePct: "not-a-number" },
        pdfCanvasConfig: { widthCm: -1, heightCm: 0, orientation: "sideways" },
      }),
    );

    const { draft } = loadStoredCouponBookEditorState(
      festivalId,
      activityId,
      fallbackDraft,
    );

    expect(draft.globalSettings.globalLayout).toEqual(
      fallbackDraft.globalSettings.globalLayout,
    );
    expect(draft.globalSettings.pdfCanvas).toEqual(
      fallbackDraft.globalSettings.pdfCanvas,
    );
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(draftKey);
  });
});

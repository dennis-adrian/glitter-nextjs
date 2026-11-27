import { describe, expect, it } from "vitest";

import type {
  CouponBookEntry,
  CouponBookParticipantAssignment,
  CouponBookVariant,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
  buildInitialCouponBookDraft,
  CouponBookDraft,
  getDraftBookPages,
  isCouponBookDraft,
  updateVariantCouponCount,
} from "@/app/lib/festival_activites/coupon-book-draft";
import {
  auditCouponBookDraft,
  describeCouponBookAudit,
  dropUnprintedRemovedCoupons,
  hasCouponBookAuditIssues,
  isCouponBookAuditBlocking,
  refreshDraftFromSource,
  relocateMovedCoupons,
} from "@/app/lib/festival_activites/coupon-book-reconciliation";

function entry(
  participationId: number,
  name: string,
  proofStatus: "approved" | "pending_review" = "approved",
): CouponBookEntry {
  return {
    participationId,
    participantName: name,
    standLabels: [],
    sectorName: null,
    promoHighlight: "",
    promoDescription: `Promo ${name}`,
    promoConditions: null,
    imageUrl: null,
    proofStatus,
  };
}

function variants(
  a: CouponBookEntry[],
  b: CouponBookEntry[],
  limits: [number | null, number | null] = [3, 3],
): CouponBookVariant[] {
  return [
    {
      detailId: 10,
      detailLabel: "Variante A",
      headerImageUrl: null,
      participationLimit: limits[0],
      entries: a,
    },
    {
      detailId: 11,
      detailLabel: "Variante B",
      headerImageUrl: null,
      participationLimit: limits[1],
      entries: b,
    },
  ];
}

function assignmentsFrom(
  input: CouponBookVariant[],
): CouponBookParticipantAssignment[] {
  return input.flatMap((variant) =>
    variant.entries.map((item) => ({
      participationId: item.participationId!,
      detailId: variant.detailId,
      detailLabel: variant.detailLabel,
      participantName: item.participantName,
      couponProofStatus: item.proofStatus,
    })),
  );
}

function build(input: CouponBookVariant[]): CouponBookDraft {
  return buildInitialCouponBookDraft({
    festivalId: 1,
    activityId: 2,
    variants: input,
  });
}

function bookCoupons(draft: CouponBookDraft, bookId: string) {
  return getDraftBookPages(draft, bookId).flatMap(
    (page) => page.slotCouponIds,
  );
}

/** A draft saved before `sourceDetailId` existed. */
function stripSourceDetailIds(draft: CouponBookDraft): CouponBookDraft {
  return {
    ...draft,
    entries: Object.fromEntries(
      Object.entries(draft.entries).map(([id, item]) => {
        const rest = { ...item };
        delete rest.sourceDetailId;
        return [id, rest];
      }),
    ),
  };
}

const alpha = entry(1, "Alpha");
const beta = entry(2, "Beta");
const gamma = entry(3, "Gamma");

describe("coupon-book reconciliation", () => {
  it("records each participant's variant on the draft entry", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    expect(draft.entries["participant-1"].sourceDetailId).toBe(10);
    expect(draft.entries["participant-3"].sourceDetailId).toBe(11);
    expect(draft.entries.courtesy.sourceDetailId).toBeUndefined();
    expect(isCouponBookDraft(draft)).toBe(true);
  });

  it("finds nothing when participations match the draft", () => {
    const source = variants([alpha, beta], [gamma]);
    const audit = auditCouponBookDraft(build(source), assignmentsFrom(source));
    expect(hasCouponBookAuditIssues(audit)).toBe(false);
    expect(isCouponBookAuditBlocking(audit)).toBe(false);
  });

  it("flags a participant moved to another variant after the draft was saved", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const now = assignmentsFrom(variants([alpha], [beta, gamma]));

    const audit = auditCouponBookDraft(draft, now);

    expect(audit.moved).toEqual([
      expect.objectContaining({
        participationId: 2,
        participantName: "Beta",
        draftDetailId: 10,
        draftVariantLabel: "Variante A",
        currentDetailId: 11,
        currentVariantLabel: "Variante B",
        printed: true,
      }),
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toBe(
      "El borrador está desactualizado. Cambiaron de variante: Beta (Variante A → Variante B). Actualizá la cuponera antes de exportar.",
    );
  });

  it("flags a legacy coupon outside its current variant's book as unverified, not moved", () => {
    const legacy = stripSourceDetailIds(build(variants([alpha, beta], [gamma])));
    expect(isCouponBookDraft(legacy)).toBe(true);

    const audit = auditCouponBookDraft(
      legacy,
      assignmentsFrom(variants([alpha], [beta, gamma])),
    );

    expect(audit.moved).toEqual([]);
    expect(audit.unverified).toEqual([
      expect.objectContaining({
        participationId: 2,
        placedVariantLabel: "Variante A",
        currentDetailId: 11,
        currentVariantLabel: "Variante B",
        printed: true,
      }),
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toContain(
      "No se puede confirmar la variante (borrador anterior): Beta (en Variante A, ahora Variante B)",
    );
  });

  it("does not report a legacy spillover coupon as moved", () => {
    const source = variants([alpha, beta, gamma], [], [3, 3]);
    const legacy = stripSourceDetailIds(
      updateVariantCouponCount(build(source), "book-10", 2),
    );
    expect(bookCoupons(legacy, "book-11")).toContain("participant-3");

    const audit = auditCouponBookDraft(legacy, assignmentsFrom(source));

    expect(audit.moved).toEqual([]);
    expect(audit.unverified.map((item) => item.participantName)).toEqual([
      "Gamma",
    ]);
    // Refreshing from source settles it: Gamma is recorded in its own variant
    // and stays as ordinary spillover.
    const refreshed = refreshDraftFromSource(
      legacy,
      build(source),
      source,
      assignmentsFrom(source),
    );
    expect(refreshed.entries["participant-3"].sourceDetailId).toBe(10);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(source)),
      ),
    ).toBe(false);
  });

  it("does not flag a coupon that spilled into the next book while its variant is unchanged", () => {
    const source = variants([alpha, beta, gamma], [], [3, 3]);
    const draft = updateVariantCouponCount(build(source), "book-10", 2);
    expect(bookCoupons(draft, "book-11")).toContain("participant-3");

    const audit = auditCouponBookDraft(draft, assignmentsFrom(source));
    expect(hasCouponBookAuditIssues(audit)).toBe(false);
  });

  it("does not block export for a moved coupon that is hidden by the inclusion mode", () => {
    const pending = entry(2, "Beta", "pending_review");
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: variants([alpha, pending], [gamma]),
      participantInclusionMode: "approved_only",
    });

    const audit = auditCouponBookDraft(
      draft,
      assignmentsFrom(variants([alpha], [pending, gamma])),
    );

    expect(audit.moved).toHaveLength(1);
    expect(audit.moved[0].printed).toBe(false);
    expect(isCouponBookAuditBlocking(audit)).toBe(false);
  });

  it("flags removed participants and new ones without a coupon", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const delta = entry(4, "Delta");
    const now = assignmentsFrom(variants([alpha], [gamma, delta]));

    const audit = auditCouponBookDraft(draft, now);

    expect(audit.removed).toEqual([
      expect.objectContaining({ participationId: 2, participantName: "Beta" }),
    ]);
    expect(audit.added).toEqual([
      expect.objectContaining({
        participationId: 4,
        participantName: "Delta",
        variantLabel: "Variante B",
        printable: true,
      }),
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toContain("Ya no participan: Beta");
    expect(describeCouponBookAudit(audit)).toContain(
      "se sumaron y no tienen cupón: Delta (Variante B)",
    );
  });

  it("ignores new participants without a coupon proof", () => {
    const draft = build(variants([alpha], [gamma]));
    const audit = auditCouponBookDraft(draft, [
      ...assignmentsFrom(variants([alpha], [gamma])),
      {
        participationId: 9,
        detailId: 11,
        detailLabel: "Variante B",
        participantName: "Sin prueba",
        couponProofStatus: null,
      },
    ]);
    expect(audit.added).toEqual([]);
  });

  it("moves the coupon into an empty slot of the new variant's book", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const now = assignmentsFrom(variants([alpha], [beta, gamma]));

    const { draft: fixed, unresolved } = relocateMovedCoupons(draft, now);

    expect(unresolved).toEqual([]);
    expect(bookCoupons(fixed, "book-10")).toEqual(["participant-1", null, null]);
    expect(bookCoupons(fixed, "book-11")).toEqual([
      "participant-3",
      "participant-2",
      null,
    ]);
    expect(fixed.entries["participant-2"].sourceDetailId).toBe(11);
    expect(isCouponBookDraft(fixed)).toBe(true);
    expect(hasCouponBookAuditIssues(auditCouponBookDraft(fixed, now))).toBe(
      false,
    );
  });

  it("keeps the admin's arrangement of the other coupons", () => {
    const delta = entry(4, "Delta");
    const draft = build(variants([alpha, beta, delta], [gamma]));
    const reordered: CouponBookDraft = {
      ...draft,
      pages: Object.fromEntries(
        Object.entries(draft.pages).map(([id, page]) => [
          id,
          page.bookId === "book-10"
            ? {
                ...page,
                slotCouponIds: ["participant-4", "participant-2", "participant-1"],
              }
            : page,
        ]),
      ),
    };

    const { draft: fixed } = relocateMovedCoupons(
      reordered,
      assignmentsFrom(variants([alpha, delta], [beta, gamma])),
    );

    expect(bookCoupons(fixed, "book-10")).toEqual([
      "participant-4",
      null,
      "participant-1",
    ]);
  });

  it("grows a full target book by one slot", () => {
    const delta = entry(4, "Delta");
    const draft = build(variants([alpha, beta], [gamma, delta], [2, 2]));
    const now = assignmentsFrom(variants([alpha], [beta, gamma, delta]));

    const { draft: fixed } = relocateMovedCoupons(draft, now);

    const book = fixed.books.find((item) => item.id === "book-11")!;
    expect(book.variantCouponCount).toBe(3);
    expect(bookCoupons(fixed, "book-11")).toEqual([
      "participant-3",
      "participant-4",
      "participant-2",
    ]);
    expect(isCouponBookDraft(fixed)).toBe(true);
  });

  it("starts a new page when the target book's last page is full", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: variants([alpha, beta], [gamma], [2, 1]),
      dynamicCouponsPerPage: 1,
    });
    const { draft: fixed } = relocateMovedCoupons(
      draft,
      assignmentsFrom(variants([alpha], [beta, gamma])),
    );

    const pages = getDraftBookPages(fixed, "book-11");
    expect(pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(pages[1].slotCouponIds).toEqual(["participant-2"]);
    expect(isCouponBookDraft(fixed)).toBe(true);
  });

  it("reports participants whose new variant has no book in the draft", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const now: CouponBookParticipantAssignment[] = [
      ...assignmentsFrom(variants([alpha], [gamma])),
      {
        participationId: 2,
        detailId: 12,
        detailLabel: "Variante C",
        participantName: "Beta",
        couponProofStatus: "approved",
      },
    ];

    const { draft: fixed, unresolved } = relocateMovedCoupons(draft, now);

    expect(unresolved.map((item) => item.participationId)).toEqual([2]);
    expect(fixed.entries["participant-2"].sourceDetailId).toBe(10);
  });

  it("leaves unverified legacy coupons to the refresh instead of relocating them", () => {
    const legacy = stripSourceDetailIds(build(variants([alpha, beta], [gamma])));
    const now = assignmentsFrom(variants([alpha], [beta, gamma]));

    const { draft: fixed } = relocateMovedCoupons(legacy, now);

    expect(fixed).toBe(legacy);
  });

  it("places a legacy coupon in its current variant's book when refreshing from source", () => {
    const legacy = stripSourceDetailIds(build(variants([alpha, beta], [gamma])));
    const nowVariants = variants([alpha], [beta, gamma]);

    const refreshed = refreshDraftFromSource(
      legacy,
      build(nowVariants),
      nowVariants,
      assignmentsFrom(nowVariants),
    );

    expect(bookCoupons(refreshed, "book-11")).toContain("participant-2");
    expect(refreshed.entries["participant-2"].sourceDetailId).toBe(11);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });

  it("places a moved participant in its new book when refreshing from source", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const nowVariants = variants([alpha], [beta, gamma]);
    const refreshed = refreshDraftFromSource(
      draft,
      build(nowVariants),
      nowVariants,
      assignmentsFrom(nowVariants),
    );

    expect(bookCoupons(refreshed, "book-11")).toContain("participant-2");
    expect(bookCoupons(refreshed, "book-10")).not.toContain("participant-2");
    expect(refreshed.entries["participant-2"].sourceDetailId).toBe(11);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });

  it("does not record a move into a full book while leaving the coupon in its old book", () => {
    const mover = entry(5, "Mover");
    const delta = entry(4, "Delta");
    const draft = build(variants([alpha, mover], [beta, delta], [2, 2]));
    const nowVariants = variants([alpha], [beta, delta, mover], [2, 2]);

    const refreshed = refreshDraftFromSource(
      draft,
      build(nowVariants),
      nowVariants,
      assignmentsFrom(nowVariants),
    );

    expect(bookCoupons(refreshed, "book-11")).toContain("participant-5");
    expect(bookCoupons(refreshed, "book-10")).not.toContain("participant-5");
    expect(refreshed.entries["participant-5"].sourceDetailId).toBe(11);
    expect(
      refreshed.books.find((book) => book.id === "book-11")!.variantCouponCount,
    ).toBe(3);
    expect(isCouponBookDraft(refreshed)).toBe(true);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });

  it("keeps ordinary spillover of coupons that did not move when refreshing", () => {
    const source = variants([alpha, beta, gamma], [], [3, 3]);
    const draft = updateVariantCouponCount(build(source), "book-10", 2);

    const refreshed = refreshDraftFromSource(
      draft,
      build(source),
      source,
      assignmentsFrom(source),
    );

    expect(bookCoupons(refreshed, "book-10")).toEqual([
      "participant-1",
      "participant-2",
    ]);
    expect(bookCoupons(refreshed, "book-11")).toContain("participant-3");
    expect(refreshed.entries["participant-3"].sourceDetailId).toBe(10);
  });

  it("does not block export for a removed participant whose coupon would not print", () => {
    const hidden = entry(2, "Beta", "pending_review");
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: variants([alpha, hidden], [gamma]),
      participantInclusionMode: "approved_only",
    });
    const now = assignmentsFrom(variants([alpha], [gamma]));

    const audit = auditCouponBookDraft(draft, now);

    expect(audit.removed).toEqual([
      expect.objectContaining({ participationId: 2, printed: false }),
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(false);
    expect(describeCouponBookAudit(audit)).toBe("");

    const printable = dropUnprintedRemovedCoupons(draft, audit);
    expect(printable.entries["participant-2"]).toBeUndefined();
    expect(
      Object.values(printable.pages).some((page) =>
        page.slotCouponIds.includes("participant-2"),
      ),
    ).toBe(false);
    expect(isCouponBookDraft(printable)).toBe(true);
  });

  it("still blocks export for a removed participant whose coupon would print", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const audit = auditCouponBookDraft(
      draft,
      assignmentsFrom(variants([alpha], [gamma])),
    );
    expect(audit.removed[0].printed).toBe(true);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(dropUnprintedRemovedCoupons(draft, audit)).toBe(draft);
  });

  it("blocks export of a printed coupon whose participant lost their proof", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const now = [
      ...assignmentsFrom(variants([alpha], [gamma])),
      {
        participationId: 2,
        detailId: 10,
        detailLabel: "Variante A",
        participantName: "Beta",
        couponProofStatus: null,
      },
    ];

    const audit = auditCouponBookDraft(draft, now);

    expect(audit.withdrawn).toEqual([
      expect.objectContaining({ participationId: 2, printed: true }),
    ]);
    expect(audit.removed).toEqual([]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toContain(
      "Ya no tienen una promoción vigente: Beta",
    );
  });

  it("treats a proof back in review as withdrawn when only approved coupons print", () => {
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: variants([alpha, beta], [gamma]),
      participantInclusionMode: "approved_only",
    });
    const pendingAgain = variants([alpha, entry(2, "Beta", "pending_review")], [gamma]);

    const audit = auditCouponBookDraft(draft, assignmentsFrom(pendingAgain));

    expect(audit.withdrawn.map((item) => item.participantName)).toEqual([
      "Beta",
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    // Refreshing updates the proof status, which hides the coupon.
    const refreshed = refreshDraftFromSource(
      draft,
      buildInitialCouponBookDraft({
        festivalId: 1,
        activityId: 2,
        variants: pendingAgain,
        participantInclusionMode: "approved_only",
      }),
      pendingAgain,
      assignmentsFrom(pendingAgain),
    );
    expect(
      isCouponBookAuditBlocking(
        auditCouponBookDraft(refreshed, assignmentsFrom(pendingAgain)),
      ),
    ).toBe(false);
  });

  it("does not list removed participants as withdrawn", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const audit = auditCouponBookDraft(
      draft,
      assignmentsFrom(variants([alpha], [gamma])),
    );

    expect(audit.removed.map((item) => item.participationId)).toEqual([2]);
    expect(audit.withdrawn).toEqual([]);
  });

  it("names the live label of the variant a participant moved to", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const renamed = variants([alpha], [beta, gamma]);
    renamed[1] = { ...renamed[1], detailLabel: "Variante B renombrada" };

    const audit = auditCouponBookDraft(draft, assignmentsFrom(renamed));

    expect(audit.moved[0]).toMatchObject({
      draftVariantLabel: "Variante A",
      currentVariantLabel: "Variante B renombrada",
    });
  });

  it("flags an included coupon that has no slot in any book until room is made", () => {
    const delta = entry(4, "Delta");
    const source = variants([alpha, beta, delta], [], [3, 1]);
    const draft = updateVariantCouponCount(build(source), "book-10", 1);

    const audit = auditCouponBookDraft(draft, assignmentsFrom(source));

    expect(audit.unplaced.map((item) => item.participantName)).toEqual([
      "Delta",
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toContain(
      "No tienen lugar en ningún libro: Delta (Variante A)",
    );

    const roomy = updateVariantCouponCount(draft, "book-10", 2);
    expect(
      hasCouponBookAuditIssues(auditCouponBookDraft(roomy, assignmentsFrom(source))),
    ).toBe(false);
  });

  it("keeps hidden pending coupons without a slot out of the warnings", () => {
    const pending = entry(2, "Beta", "pending_review");
    const source = variants([alpha, pending], [gamma]);
    const draft = buildInitialCouponBookDraft({
      festivalId: 1,
      activityId: 2,
      variants: source,
      participantInclusionMode: "approved_only",
    });

    expect(
      hasCouponBookAuditIssues(auditCouponBookDraft(draft, assignmentsFrom(source))),
    ).toBe(false);
  });

  it("places a printed mover that the refresh left without a slot", () => {
    const mover = entry(5, "Mover");
    const draft = build(variants([alpha, mover], [beta, gamma], [2, 2]));
    // Mover leaves A for B, and Delta joins A: the merge's reflow fills A
    // with Alpha and Delta and has no room left for Mover anywhere.
    const nowVariants = variants(
      [alpha, entry(4, "Delta")],
      [beta, gamma, mover],
      [2, 2],
    );

    const refreshed = refreshDraftFromSource(
      draft,
      build(nowVariants),
      nowVariants,
      assignmentsFrom(nowVariants),
    );

    expect(bookCoupons(refreshed, "book-11")).toContain("participant-5");
    expect(bookCoupons(refreshed, "book-10")).toEqual([
      "participant-1",
      "participant-4",
    ]);
    expect(isCouponBookDraft(refreshed)).toBe(true);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });

  it("places a mover whose new variant only gets a book from the refresh", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const nowVariants: CouponBookVariant[] = [
      ...variants([alpha], [gamma]),
      {
        detailId: 12,
        detailLabel: "Variante C",
        headerImageUrl: null,
        participationLimit: 2,
        entries: [beta],
      },
    ];

    const refreshed = refreshDraftFromSource(
      draft,
      build(nowVariants),
      nowVariants,
      assignmentsFrom(nowVariants),
    );

    expect(bookCoupons(refreshed, "book-12")).toContain("participant-2");
    expect(bookCoupons(refreshed, "book-10")).not.toContain("participant-2");
    expect(refreshed.entries["participant-2"].sourceDetailId).toBe(12);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(refreshed, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });

  it("keeps a relocated coupon in its destination when another book's count changes", () => {
    const mover = entry(5, "Mover");
    const b3 = entry(3, "B3");
    const b2 = entry(2, "B2");
    const source = variants([alpha, mover], [b2, b3], [3, 2]);
    // Book B holds one coupon, so B3 spills into book A.
    let draft = updateVariantCouponCount(build(source), "book-11", 1);
    expect(bookCoupons(draft, "book-10")).toContain("participant-3");

    const nowVariants = variants([alpha], [b2, b3, mover], [3, 1]);
    draft = relocateMovedCoupons(draft, assignmentsFrom(nowVariants)).draft;
    expect(bookCoupons(draft, "book-11")).toEqual([
      "participant-2",
      "participant-5",
    ]);

    const grown = updateVariantCouponCount(draft, "book-10", 4);

    expect(bookCoupons(grown, "book-11")).toEqual([
      "participant-2",
      "participant-5",
    ]);
    expect(bookCoupons(grown, "book-10")).toContain("participant-3");
    expect(bookCoupons(grown, "book-10")).not.toContain("participant-5");
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(grown, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });
});

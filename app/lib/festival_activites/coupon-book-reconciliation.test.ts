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
  mergeDraftWithSource,
  updateVariantCouponCount,
} from "@/app/lib/festival_activites/coupon-book-draft";
import {
  auditCouponBookDraft,
  describeCouponBookAudit,
  hasCouponBookAuditIssues,
  isCouponBookAuditBlocking,
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
        inferred: false,
        printed: true,
      }),
    ]);
    expect(isCouponBookAuditBlocking(audit)).toBe(true);
    expect(describeCouponBookAudit(audit)).toBe(
      "El borrador está desactualizado. Cambiaron de variante: Beta (Variante A → Variante B). Actualizá la cuponera antes de exportar.",
    );
  });

  it("infers the variant of legacy entries from the book they sit in", () => {
    const legacy = stripSourceDetailIds(build(variants([alpha, beta], [gamma])));
    expect(isCouponBookDraft(legacy)).toBe(true);

    const audit = auditCouponBookDraft(
      legacy,
      assignmentsFrom(variants([alpha], [beta, gamma])),
    );

    expect(audit.moved).toHaveLength(1);
    expect(audit.moved[0]).toMatchObject({
      participationId: 2,
      draftDetailId: 10,
      currentDetailId: 11,
      inferred: true,
    });
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

  it("relocates legacy entries and stamps their current variant", () => {
    const legacy = stripSourceDetailIds(build(variants([alpha, beta], [gamma])));
    const now = assignmentsFrom(variants([alpha], [beta, gamma]));

    const { draft: fixed } = relocateMovedCoupons(legacy, now);

    expect(bookCoupons(fixed, "book-11")).toContain("participant-2");
    expect(fixed.entries["participant-2"].sourceDetailId).toBe(11);
  });

  it("places a moved participant in its new book when merging from source", () => {
    const draft = build(variants([alpha, beta], [gamma]));
    const nowVariants = variants([alpha], [beta, gamma]);
    const merged = mergeDraftWithSource(draft, build(nowVariants), nowVariants);

    expect(bookCoupons(merged, "book-11")).toContain("participant-2");
    expect(bookCoupons(merged, "book-10")).not.toContain("participant-2");
    expect(merged.entries["participant-2"].sourceDetailId).toBe(11);
    expect(
      hasCouponBookAuditIssues(
        auditCouponBookDraft(merged, assignmentsFrom(nowVariants)),
      ),
    ).toBe(false);
  });
});

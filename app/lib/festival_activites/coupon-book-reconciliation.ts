import type {
  CouponBookParticipantAssignment,
  CouponBookVariant,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
  CouponBookDraft,
  CouponBookReconciliation,
  DraftCouponPage,
  getDraftBookPages,
  isEntryIncluded,
  mergeDraftWithSource,
  participantCouponId,
} from "@/app/lib/festival_activites/coupon-book-draft";

/**
 * Reconciles a coupon-book draft against where participants are now.
 *
 * A participant moved to another variant keeps its participation id, proofs
 * and coupon content, so the content diff in `reconcileDraftWithSource` sees
 * nothing. Each entry records the variant it was captured from
 * (`sourceDetailId`); comparing that with the live variant finds the move.
 *
 * Drafts saved before the field existed only say which book a coupon sits in,
 * and a coupon can sit in another variant's book because that variant's book
 * was full (spillover). So a legacy coupon outside its current variant's book
 * is reported as unverified, not as moved: refreshing from source settles it.
 */

export type CouponBookMovedParticipant = {
  couponId: string;
  participationId: number;
  participantName: string;
  draftDetailId: number;
  draftVariantLabel: string;
  currentDetailId: number;
  currentVariantLabel: string;
  /** Placed in a page slot and included by the inclusion mode. */
  printed: boolean;
};

/**
 * A coupon from a draft saved before variants were recorded that sits in a
 * book other than its participant's current variant: either a move or
 * spillover from a full book, which the draft cannot tell apart.
 */
export type CouponBookUnverifiedParticipant = {
  couponId: string;
  participationId: number;
  participantName: string;
  placedVariantLabel: string;
  currentDetailId: number;
  currentVariantLabel: string;
  printed: boolean;
};

export type CouponBookRemovedParticipant = {
  couponId: string;
  participationId: number;
  participantName: string;
  printed: boolean;
};

export type CouponBookAddedParticipant = {
  participationId: number;
  participantName: string;
  detailId: number;
  variantLabel: string;
  /** Would be printed under the draft's inclusion mode. */
  printable: boolean;
};

export type CouponBookDraftAudit = {
  moved: CouponBookMovedParticipant[];
  unverified: CouponBookUnverifiedParticipant[];
  removed: CouponBookRemovedParticipant[];
  added: CouponBookAddedParticipant[];
};

function collectPlacements(draft: CouponBookDraft): Map<string, string[]> {
  const placements = new Map<string, string[]>();
  for (const book of draft.books) {
    for (const page of getDraftBookPages(draft, book.id)) {
      for (const couponId of page.slotCouponIds) {
        if (!couponId) continue;
        const bookIds = placements.get(couponId) ?? [];
        if (!bookIds.includes(book.id)) bookIds.push(book.id);
        placements.set(couponId, bookIds);
      }
    }
  }
  return placements;
}

export function auditCouponBookDraft(
  draft: CouponBookDraft,
  assignments: CouponBookParticipantAssignment[],
): CouponBookDraftAudit {
  const byParticipation = new Map(
    assignments.map((assignment) => [assignment.participationId, assignment]),
  );
  const placements = collectPlacements(draft);
  const mode = draft.globalSettings.participantInclusionMode;
  const bookByDetailId = new Map(
    draft.books.map((book) => [book.sourceDetailId, book]),
  );
  const labelForDetail = (detailId: number) =>
    bookByDetailId.get(detailId)?.label ??
    assignments.find((assignment) => assignment.detailId === detailId)
      ?.detailLabel ??
    `Variante ${detailId}`;

  const audit: CouponBookDraftAudit = {
    moved: [],
    unverified: [],
    removed: [],
    added: [],
  };
  const draftParticipationIds = new Set<number>();

  for (const entry of Object.values(draft.entries)) {
    if (entry.type !== "participant" || entry.participationId === null) {
      continue;
    }
    draftParticipationIds.add(entry.participationId);
    const placedBookIds = placements.get(entry.id) ?? [];
    const printed = placedBookIds.length > 0 && isEntryIncluded(entry, mode);
    const current = byParticipation.get(entry.participationId);

    if (!current) {
      audit.removed.push({
        couponId: entry.id,
        participationId: entry.participationId,
        participantName: entry.participantName,
        printed,
      });
      continue;
    }

    const draftDetailId = entry.sourceDetailId ?? null;
    if (draftDetailId === null) {
      // Legacy entry: the book it sits in is the only clue, and spillover
      // makes it ambiguous. Flag it only when it is outside its current
      // variant's book; never claim a move.
      const placedBooks = draft.books.filter((book) =>
        placedBookIds.includes(book.id),
      );
      if (
        placedBooks.length > 0 &&
        !placedBooks.some((book) => book.sourceDetailId === current.detailId)
      ) {
        audit.unverified.push({
          couponId: entry.id,
          participationId: entry.participationId,
          participantName: entry.participantName,
          placedVariantLabel: placedBooks.map((book) => book.label).join(", "),
          currentDetailId: current.detailId,
          currentVariantLabel: labelForDetail(current.detailId),
          printed,
        });
      }
      continue;
    }
    if (draftDetailId === current.detailId) continue;

    audit.moved.push({
      couponId: entry.id,
      participationId: entry.participationId,
      participantName: entry.participantName,
      draftDetailId,
      draftVariantLabel: labelForDetail(draftDetailId),
      currentDetailId: current.detailId,
      currentVariantLabel: labelForDetail(current.detailId),
      printed,
    });
  }

  for (const assignment of assignments) {
    if (assignment.couponProofStatus === null) continue;
    if (draftParticipationIds.has(assignment.participationId)) continue;
    audit.added.push({
      participationId: assignment.participationId,
      participantName: assignment.participantName,
      detailId: assignment.detailId,
      variantLabel: labelForDetail(assignment.detailId),
      printable:
        mode === "approved_and_pending" ||
        assignment.couponProofStatus === "approved",
    });
  }

  return audit;
}

export function hasCouponBookAuditIssues(audit: CouponBookDraftAudit): boolean {
  return (
    audit.moved.length > 0 ||
    audit.unverified.length > 0 ||
    audit.removed.length > 0 ||
    audit.added.length > 0
  );
}

/**
 * Whether exporting this draft would print a wrong book: a printed coupon for
 * a participant who changed variant (or may have, in a legacy draft) or who no
 * longer participates, or a missing coupon for someone who joined since.
 * Coupons that would not print do not block.
 */
export function isCouponBookAuditBlocking(audit: CouponBookDraftAudit): boolean {
  return (
    audit.moved.some((item) => item.printed) ||
    audit.unverified.some((item) => item.printed) ||
    audit.removed.some((item) => item.printed) ||
    audit.added.some((item) => item.printable)
  );
}

/**
 * Drops the coupons of removed participants that would not print anyway, so
 * the export's participation check does not refuse a draft whose printed
 * output is correct. Their slots are emptied too.
 */
export function dropUnprintedRemovedCoupons(
  draft: CouponBookDraft,
  audit: CouponBookDraftAudit,
): CouponBookDraft {
  const dropped = new Set(
    audit.removed.filter((item) => !item.printed).map((item) => item.couponId),
  );
  if (dropped.size === 0) return draft;
  return {
    ...draft,
    entries: Object.fromEntries(
      Object.entries(draft.entries).filter(([id]) => !dropped.has(id)),
    ),
    pages: Object.fromEntries(
      Object.entries(draft.pages).map(([id, page]) => [
        id,
        {
          ...page,
          slotCouponIds: page.slotCouponIds.map((couponId) =>
            couponId && dropped.has(couponId) ? null : couponId,
          ),
        },
      ]),
    ),
  };
}

/**
 * Coupons still in the draft whose participant is active but no longer has an
 * approved or pending proof, so the source no longer builds a coupon for them.
 * Removed participants are excluded: the audit already lists them.
 */
export function listWithdrawnCoupons(
  draft: CouponBookDraft,
  contentChanges: CouponBookReconciliation,
  audit: CouponBookDraftAudit,
): Array<{ couponId: string; participationId: number; participantName: string }> {
  const removed = new Set(audit.removed.map((item) => item.participationId));
  return contentChanges.removedParticipationIds
    .filter((participationId) => !removed.has(participationId))
    .flatMap((participationId) => {
      const couponId = participantCouponId(participationId);
      const entry = draft.entries[couponId];
      if (!entry || entry.type !== "participant") return [];
      return [
        { couponId, participationId, participantName: entry.participantName },
      ];
    });
}

function listNames(names: string[]): string {
  return names.join(", ");
}

/** One Spanish paragraph for the export refusal. */
export function describeCouponBookAudit(audit: CouponBookDraftAudit): string {
  const parts: string[] = [];
  const moved = audit.moved.filter((item) => item.printed);
  if (moved.length > 0) {
    parts.push(
      `cambiaron de variante: ${listNames(
        moved.map(
          (item) =>
            `${item.participantName} (${item.draftVariantLabel} → ${item.currentVariantLabel})`,
        ),
      )}`,
    );
  }
  const unverified = audit.unverified.filter((item) => item.printed);
  if (unverified.length > 0) {
    parts.push(
      `no se puede confirmar la variante (borrador anterior): ${listNames(
        unverified.map(
          (item) =>
            `${item.participantName} (en ${item.placedVariantLabel}, ahora ${item.currentVariantLabel})`,
        ),
      )}`,
    );
  }
  const removed = audit.removed.filter((item) => item.printed);
  if (removed.length > 0) {
    parts.push(
      `ya no participan: ${listNames(
        removed.map((item) => item.participantName),
      )}`,
    );
  }
  const added = audit.added.filter((item) => item.printable);
  if (added.length > 0) {
    parts.push(
      `se sumaron y no tienen cupón: ${listNames(
        added.map((item) => `${item.participantName} (${item.variantLabel})`),
      )}`,
    );
  }
  if (parts.length === 0) return "";
  return `El borrador está desactualizado. ${parts
    .map((part, index) => (index === 0 ? capitalize(part) : part))
    .join("; ")}. Actualizá la cuponera antes de exportar.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Moves the coupon of every participant who changed variant into the book of
 * their current variant, touching nothing else so manual arrangements stay.
 * The coupon takes the first empty slot of that book; if the book is full it
 * grows by one slot (a new page when the last one is full). The old slot is
 * left empty, as when a participant leaves. Participants whose variant has no
 * book in the draft are returned as unresolved and keep their old variant, so
 * they stay flagged until the books are refreshed from source.
 */
export function relocateMovedCoupons(
  draft: CouponBookDraft,
  assignments: CouponBookParticipantAssignment[],
): { draft: CouponBookDraft; unresolved: CouponBookMovedParticipant[] } {
  const { moved } = auditCouponBookDraft(draft, assignments);
  if (moved.length === 0) return { draft, unresolved: [] };

  const perPage = draft.globalSettings.dynamicCouponsPerPage;
  let books = draft.books.map((book) => ({
    ...book,
    pageIds: [...book.pageIds],
  }));
  const pages: Record<string, DraftCouponPage> = { ...draft.pages };
  const entries = { ...draft.entries };
  const unresolved: CouponBookMovedParticipant[] = [];
  const working = () => ({ ...draft, books, pages, entries });

  for (const item of moved) {
    const target = books.find(
      (book) => book.sourceDetailId === item.currentDetailId,
    );
    if (!target) {
      unresolved.push(item);
      continue;
    }

    const placedBookIds = collectPlacements(working()).get(item.couponId) ?? [];
    const alreadyInTarget =
      placedBookIds.length === 1 && placedBookIds[0] === target.id;

    if (placedBookIds.length > 0 && !alreadyInTarget) {
      for (const page of Object.values(pages)) {
        if (!page.slotCouponIds.includes(item.couponId)) continue;
        pages[page.id] = {
          ...page,
          slotCouponIds: page.slotCouponIds.map((id) =>
            id === item.couponId ? null : id,
          ),
        };
      }

      const targetPages = getDraftBookPages(working(), target.id);
      const emptyPage = targetPages.find((page) =>
        page.slotCouponIds.includes(null),
      );
      if (emptyPage) {
        const slotIndex = emptyPage.slotCouponIds.indexOf(null);
        pages[emptyPage.id] = {
          ...emptyPage,
          slotCouponIds: emptyPage.slotCouponIds.map((id, index) =>
            index === slotIndex ? item.couponId : id,
          ),
        };
      } else {
        const lastPage = targetPages[targetPages.length - 1];
        if (lastPage && lastPage.slotCouponIds.length < perPage) {
          pages[lastPage.id] = {
            ...lastPage,
            slotCouponIds: [...lastPage.slotCouponIds, item.couponId],
          };
        } else {
          const page: DraftCouponPage = {
            id: crypto.randomUUID(),
            bookId: target.id,
            pageNumber: (lastPage?.pageNumber ?? 0) + 1,
            slotCouponIds: [item.couponId],
          };
          pages[page.id] = page;
          books = books.map((book) =>
            book.id === target.id
              ? { ...book, pageIds: [...book.pageIds, page.id] }
              : book,
          );
        }
        books = books.map((book) =>
          book.id === target.id
            ? { ...book, variantCouponCount: book.variantCouponCount + 1 }
            : book,
        );
      }
    }

    const entry = entries[item.couponId];
    if (entry) {
      entries[item.couponId] = {
        ...entry,
        sourceDetailId: item.currentDetailId,
      };
    }
  }

  return {
    draft: {
      ...draft,
      updatedAt: new Date().toISOString(),
      books,
      pages,
      entries,
    },
    unresolved,
  };
}

/**
 * "Actualizar participantes desde fuente": merges new, removed and changed
 * participants, then moves each relocated coupon into its new variant's book.
 *
 * The merge's reflow fills books by variant but lets a full book spill over,
 * so it could leave a moved coupon in its old book. The merge therefore keeps
 * a moved coupon's old variant, and the relocation afterwards places it in the
 * new variant's book (growing that book if it is full) before recording the
 * move. Ordinary spillover of coupons that did not move is left as is.
 */
export function refreshDraftFromSource(
  draft: CouponBookDraft,
  sourceDraft: CouponBookDraft,
  variants: CouponBookVariant[],
  assignments: CouponBookParticipantAssignment[],
): CouponBookDraft {
  const merged = mergeDraftWithSource(draft, sourceDraft, variants);
  return relocateMovedCoupons(merged, assignments).draft;
}

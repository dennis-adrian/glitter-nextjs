import {
  COUPON_BOOK_BODY_SLOTS,
  COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE,
  COURTESY_COUPON_ENTRY,
  CouponBookEntry,
  CouponBookPage,
  CouponBookVariant,
  CouponTextBoxConfig,
  CouponTextLayoutConfig,
  DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";
import { parseCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft-schema";
import {
  PdfCanvasConfig,
  resolvePdfCanvasConfig,
} from "@/app/lib/festival_activites/coupon-book-print-config";

export const COUPON_BOOK_DRAFT_SCHEMA_VERSION = 1;
export const DEFAULT_DYNAMIC_COUPONS_PER_PAGE =
  COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE;
export const MAX_DYNAMIC_COUPONS_PER_PAGE = COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE;
export const MIN_DYNAMIC_COUPONS_PER_PAGE = 1;
export const COURTESY_COUPON_ID = "courtesy";

export type ParticipantInclusionMode = "approved_only" | "approved_and_pending";

export type CouponLayoutOverride = Partial<{
  leftColumnWidthPct: number;
  standFontSizeMm: number;
  sectorFontSizeMm: number;
  nameBox: Partial<CouponTextBoxConfig>;
  highlightBox: Partial<CouponTextBoxConfig>;
  descriptionBox: Partial<CouponTextBoxConfig>;
  validityBox: Partial<CouponTextBoxConfig>;
}>;

export type DraftCouponEntry = {
  id: string;
  participationId: number | null;
  type: "courtesy" | "participant";
  participantName: string;
  standLabels: string[];
  sectorName: string | null;
  promoHighlight: string;
  promoDescription: string;
  promoConditions: string | null;
  imageUrl: string | null;
  proofStatus: "approved" | "pending_review";
  layoutOverride?: CouponLayoutOverride | null;
  sourceSnapshot?: Omit<
    DraftCouponEntry,
    "id" | "layoutOverride" | "sourceSnapshot" | "type"
  >;
};

export type DraftCouponBook = {
  id: string;
  label: string;
  sourceDetailId: number;
  headerImageUrl: string | null;
  pageIds: string[];
};

export type DraftCouponPage = {
  id: string;
  bookId: string;
  pageNumber: number;
  slotCouponIds: (string | null)[];
};

export type CouponBookDraftGlobalSettings = {
  pdfCanvas: PdfCanvasConfig;
  dynamicCouponsPerPage: number;
  participantInclusionMode: ParticipantInclusionMode;
  globalLayout: CouponTextLayoutConfig;
};

export type CouponBookDraft = {
  festivalId: number;
  activityId: number;
  schemaVersion: number;
  updatedAt: string;
  savedRevision?: number | null;
  globalSettings: CouponBookDraftGlobalSettings;
  courtesyCouponId: string;
  entries: Record<string, DraftCouponEntry>;
  books: DraftCouponBook[];
  pages: Record<string, DraftCouponPage>;
};

export type CouponBookEditorUiState = {
  selectedBookId?: string;
  selectedPageId?: string;
  selectedCouponId?: string;
};

export type CouponBookReconciliation = {
  newParticipationIds: number[];
  removedParticipationIds: number[];
  changedParticipationIds: number[];
};

export type CouponBookExportScope =
  | { type: "all" }
  | { type: "book"; bookId: string };

function participantCouponId(participationId: number): string {
  return `participant-${participationId}`;
}

function clampDynamicCouponsPerPage(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DYNAMIC_COUPONS_PER_PAGE;
  return Math.min(
    MAX_DYNAMIC_COUPONS_PER_PAGE,
    Math.max(MIN_DYNAMIC_COUPONS_PER_PAGE, Math.round(value)),
  );
}

function mergeTextBox(
  base: CouponTextBoxConfig,
  override?: Partial<CouponTextBoxConfig>,
): CouponTextBoxConfig {
  if (!override) return base;
  return { ...base, ...override };
}

export function mergeLayoutWithOverride(
  globalLayout: CouponTextLayoutConfig,
  override?: CouponLayoutOverride | null,
): CouponTextLayoutConfig {
  if (!override) return globalLayout;
  return {
    leftColumnWidthPct:
      override.leftColumnWidthPct ?? globalLayout.leftColumnWidthPct,
    standFontSizeMm: override.standFontSizeMm ?? globalLayout.standFontSizeMm,
    sectorFontSizeMm:
      override.sectorFontSizeMm ?? globalLayout.sectorFontSizeMm,
    headerImageScalePct: globalLayout.headerImageScalePct,
    nameBox: mergeTextBox(globalLayout.nameBox, override.nameBox),
    highlightBox: mergeTextBox(
      globalLayout.highlightBox,
      override.highlightBox,
    ),
    descriptionBox: mergeTextBox(
      globalLayout.descriptionBox,
      override.descriptionBox,
    ),
    validityBox: mergeTextBox(globalLayout.validityBox, override.validityBox),
  };
}

export function draftEntryToCouponBookEntry(
  entry: DraftCouponEntry,
): CouponBookEntry {
  return {
    participationId: entry.participationId,
    participantName: entry.participantName,
    standLabels: entry.standLabels,
    sectorName: entry.sectorName,
    promoHighlight: entry.promoHighlight,
    promoDescription: entry.promoDescription,
    promoConditions: entry.promoConditions,
    imageUrl: entry.imageUrl,
    proofStatus: entry.proofStatus,
  };
}

export function couponBookEntryToDraftEntry(
  entry: CouponBookEntry,
  type: "courtesy" | "participant",
  id?: string,
): DraftCouponEntry {
  const resolvedId =
    id ??
    (entry.participationId !== null
      ? participantCouponId(entry.participationId)
      : COURTESY_COUPON_ID);
  const snapshot = {
    participationId: entry.participationId,
    participantName: entry.participantName,
    standLabels: [...entry.standLabels],
    sectorName: entry.sectorName,
    promoHighlight: entry.promoHighlight,
    promoDescription: entry.promoDescription,
    promoConditions: entry.promoConditions,
    imageUrl: entry.imageUrl,
    proofStatus: entry.proofStatus,
  };
  return {
    id: resolvedId,
    type,
    ...snapshot,
    sourceSnapshot: snapshot,
  };
}

function isEntryIncluded(
  entry: DraftCouponEntry,
  mode: ParticipantInclusionMode,
): boolean {
  if (entry.type === "courtesy") return true;
  if (mode === "approved_and_pending") return true;
  return entry.proofStatus === "approved";
}

export function getIncludedParticipantEntries(
  draft: CouponBookDraft,
): DraftCouponEntry[] {
  const mode = draft.globalSettings.participantInclusionMode;
  return Object.values(draft.entries).filter(
    (entry) => entry.type === "participant" && isEntryIncluded(entry, mode),
  );
}

export function countCouponVisibility(draft: CouponBookDraft): {
  included: number;
  hidden: number;
} {
  const participants = Object.values(draft.entries).filter(
    (entry) => entry.type === "participant",
  );
  const mode = draft.globalSettings.participantInclusionMode;
  const included = participants.filter((entry) =>
    isEntryIncluded(entry, mode),
  ).length;
  return { included, hidden: participants.length - included };
}

function distributeCouponsToPages(
  couponIds: string[],
  dynamicCouponsPerPage: number,
  bookId: string,
): DraftCouponPage[] {
  const perPage = clampDynamicCouponsPerPage(dynamicCouponsPerPage);
  const pages: DraftCouponPage[] = [];
  if (couponIds.length === 0) {
    pages.push({
      id: crypto.randomUUID(),
      bookId,
      pageNumber: 1,
      slotCouponIds: Array.from({ length: perPage }, () => null),
    });
    return pages;
  }

  for (
    let start = 0, pageNumber = 1;
    start < couponIds.length;
    start += perPage, pageNumber++
  ) {
    const chunk = couponIds.slice(start, start + perPage);
    const slotCouponIds = Array.from(
      { length: perPage },
      (_, index) => chunk[index] ?? null,
    );
    pages.push({
      id: crypto.randomUUID(),
      bookId,
      pageNumber,
      slotCouponIds,
    });
  }
  return pages;
}

export function buildInitialCouponBookDraft(input: {
  festivalId: number;
  activityId: number;
  variants: CouponBookVariant[];
  participantInclusionMode?: ParticipantInclusionMode;
  dynamicCouponsPerPage?: number;
  globalLayout?: CouponTextLayoutConfig;
  pdfCanvas?: PdfCanvasConfig;
}): CouponBookDraft {
  const mode = input.participantInclusionMode ?? "approved_and_pending";
  const dynamicCouponsPerPage = clampDynamicCouponsPerPage(
    input.dynamicCouponsPerPage ?? DEFAULT_DYNAMIC_COUPONS_PER_PAGE,
  );

  const entries: Record<string, DraftCouponEntry> = {
    [COURTESY_COUPON_ID]: couponBookEntryToDraftEntry(
      COURTESY_COUPON_ENTRY,
      "courtesy",
      COURTESY_COUPON_ID,
    ),
  };

  const books: DraftCouponBook[] = [];
  const pages: Record<string, DraftCouponPage> = {};

  for (const variant of input.variants) {
    const bookId = `book-${variant.detailId}`;
    const participantIds: string[] = [];

    for (const entry of variant.entries) {
      if (!entry.participationId) continue;
      const id = participantCouponId(entry.participationId);
      entries[id] = couponBookEntryToDraftEntry(entry, "participant", id);
      if (isEntryIncluded(entries[id], mode)) {
        participantIds.push(id);
      }
    }

    const bookPages = distributeCouponsToPages(
      participantIds,
      dynamicCouponsPerPage,
      bookId,
    );
    for (const page of bookPages) {
      pages[page.id] = page;
    }

    books.push({
      id: bookId,
      label: variant.detailLabel,
      sourceDetailId: variant.detailId,
      headerImageUrl: variant.headerImageUrl ?? null,
      pageIds: bookPages.map((page) => page.id),
    });
  }

  return {
    festivalId: input.festivalId,
    activityId: input.activityId,
    schemaVersion: COUPON_BOOK_DRAFT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    savedRevision: null,
    courtesyCouponId: COURTESY_COUPON_ID,
    globalSettings: {
      pdfCanvas:
        input.pdfCanvas ?? resolvePdfCanvasConfig(new URLSearchParams()),
      dynamicCouponsPerPage,
      participantInclusionMode: mode,
      globalLayout: input.globalLayout ?? DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
    },
    entries,
    books,
    pages,
  };
}

export function draftPageToCouponBookPage(
  draft: CouponBookDraft,
  page: DraftCouponPage,
): CouponBookPage {
  const perPage = clampDynamicCouponsPerPage(
    draft.globalSettings.dynamicCouponsPerPage,
  );
  const mode = draft.globalSettings.participantInclusionMode;
  const slotEntries = page.slotCouponIds.slice(0, perPage).map((id) => {
    if (!id) return null;
    const entry = draft.entries[id];
    if (!entry || entry.type !== "participant") return null;
    if (!isEntryIncluded(entry, mode)) return null;
    return draftEntryToCouponBookEntry(entry);
  });
  while (slotEntries.length < perPage) slotEntries.push(null);

  const headerDynamicEntry = slotEntries[0] ?? null;
  const bodyEntries: Array<CouponBookEntry | null> = slotEntries.slice(1);
  while (bodyEntries.length < COUPON_BOOK_BODY_SLOTS) bodyEntries.push(null);

  const bookPages = getDraftBookPages(draft, page.bookId);
  const totalPages = bookPages.length;

  return {
    pageNumber: page.pageNumber,
    totalPages,
    headerDynamicEntry,
    bodyEntries,
  };
}

export function getDraftBookPages(
  draft: CouponBookDraft,
  bookId: string,
): DraftCouponPage[] {
  const book = draft.books.find((item) => item.id === bookId);
  if (!book) return [];
  return book.pageIds
    .map((pageId) => draft.pages[pageId])
    .filter((page): page is DraftCouponPage => page !== undefined)
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function countEmptySlotsOnPage(
  draft: CouponBookDraft,
  page: DraftCouponPage,
): number {
  const mode = draft.globalSettings.participantInclusionMode;
  return page.slotCouponIds.filter((id) => {
    if (!id) return true;
    const entry = draft.entries[id];
    if (!entry || entry.type !== "participant") return true;
    return !isEntryIncluded(entry, mode);
  }).length;
}

function participantCouponIdsForBook(
  draft: CouponBookDraft,
  book: DraftCouponBook,
  variants?: CouponBookVariant[],
): string[] {
  const onPages = getDraftBookPages(draft, book.id).flatMap((draftPage) =>
    draftPage.slotCouponIds.filter((id): id is string => id !== null),
  );
  if (!variants) return onPages;

  const variant = variants.find((item) => item.detailId === book.sourceDetailId);
  if (!variant) return onPages;

  const variantIds = variant.entries
    .filter((entry) => entry.participationId !== null)
    .map((entry) => participantCouponId(entry.participationId as number));

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...onPages, ...variantIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

function collectIncludedCouponIdsForBook(
  draft: CouponBookDraft,
  book: DraftCouponBook,
  variants?: CouponBookVariant[],
): string[] {
  const mode = draft.globalSettings.participantInclusionMode;
  return participantCouponIdsForBook(draft, book, variants).filter((id) => {
    const entry = draft.entries[id];
    return entry && isEntryIncluded(entry, mode);
  });
}

export function reflowDraftPages(
  draft: CouponBookDraft,
  newDynamicCouponsPerPage: number,
  variants?: CouponBookVariant[],
): CouponBookDraft {
  const perPage = clampDynamicCouponsPerPage(newDynamicCouponsPerPage);
  const nextPages: Record<string, DraftCouponPage> = {};
  const nextBooks = draft.books.map((book) => {
    const includedIds = collectIncludedCouponIdsForBook(draft, book, variants);
    const bookPages = distributeCouponsToPages(includedIds, perPage, book.id);
    for (const page of bookPages) {
      nextPages[page.id] = page;
    }
    return { ...book, pageIds: bookPages.map((page) => page.id) };
  });

  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    globalSettings: {
      ...draft.globalSettings,
      dynamicCouponsPerPage: perPage,
    },
    books: nextBooks,
    pages: nextPages,
  };
}

export function moveCouponBetweenPages(input: {
  draft: CouponBookDraft;
  couponId: string;
  targetPageId: string;
  targetSlotIndex?: number;
}): CouponBookDraft {
  const { draft, couponId, targetPageId } = input;
  const entry = draft.entries[couponId];
  if (!entry || entry.type !== "participant") return draft;

  let sourcePageId: string | null = null;
  let sourceSlotIndex = -1;
  for (const page of Object.values(draft.pages)) {
    const slotIndex = page.slotCouponIds.findIndex((id) => id === couponId);
    if (slotIndex >= 0) {
      sourcePageId = page.id;
      sourceSlotIndex = slotIndex;
      break;
    }
  }

  const nextPages: Record<string, DraftCouponPage> = { ...draft.pages };
  for (const page of Object.values(nextPages)) {
    nextPages[page.id] = {
      ...page,
      slotCouponIds: page.slotCouponIds.map((id) =>
        id === couponId ? null : id,
      ),
    };
  }

  const targetPage = nextPages[targetPageId];
  if (!targetPage) return draft;

  const perPage = clampDynamicCouponsPerPage(
    draft.globalSettings.dynamicCouponsPerPage,
  );
  let slotIndex =
    input.targetSlotIndex ??
    targetPage.slotCouponIds.findIndex((id) => id === null);
  if (slotIndex < 0) slotIndex = perPage - 1;
  slotIndex = Math.min(Math.max(slotIndex, 0), perPage - 1);

  const nextSlotIds = [...targetPage.slotCouponIds];
  const displaced = nextSlotIds[slotIndex];
  nextSlotIds[slotIndex] = couponId;

  if (displaced && displaced !== couponId) {
    const fallbackIndex = nextSlotIds.findIndex(
      (id, index) => index !== slotIndex && id === null,
    );
    if (fallbackIndex >= 0) {
      nextSlotIds[fallbackIndex] = displaced;
    } else if (sourcePageId && sourceSlotIndex >= 0) {
      const sourcePage = nextPages[sourcePageId];
      if (!sourcePage) return draft;
      nextPages[sourcePageId] = {
        ...sourcePage,
        slotCouponIds: sourcePage.slotCouponIds.map((id, index) =>
          index === sourceSlotIndex ? displaced : id,
        ),
      };
    } else {
      return draft;
    }
  }

  nextPages[targetPageId] = { ...targetPage, slotCouponIds: nextSlotIds };

  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    pages: nextPages,
  };
}

export function restoreDraftCouponFromSource(
  draft: CouponBookDraft,
  couponId: string,
): CouponBookDraft {
  const entry = draft.entries[couponId];
  if (!entry?.sourceSnapshot) return draft;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    entries: {
      ...draft.entries,
      [couponId]: {
        ...entry,
        ...entry.sourceSnapshot,
        layoutOverride: null,
      },
    },
  };
}

export function updateDraftCouponEntry(
  draft: CouponBookDraft,
  couponId: string,
  patch: Partial<
    Pick<
      DraftCouponEntry,
      | "participantName"
      | "standLabels"
      | "sectorName"
      | "promoHighlight"
      | "promoDescription"
      | "promoConditions"
      | "imageUrl"
      | "layoutOverride"
    >
  >,
): CouponBookDraft {
  const entry = draft.entries[couponId];
  if (!entry) return draft;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    entries: {
      ...draft.entries,
      [couponId]: {
        ...entry,
        ...patch,
        standLabels: patch.standLabels ?? entry.standLabels,
      },
    },
  };
}

export function setParticipantInclusionMode(
  draft: CouponBookDraft,
  mode: ParticipantInclusionMode,
): CouponBookDraft {
  if (draft.globalSettings.participantInclusionMode === mode) return draft;
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    globalSettings: {
      ...draft.globalSettings,
      participantInclusionMode: mode,
    },
  };
}

export function resetDraftToDefaults(input: {
  draft: CouponBookDraft;
  variants: CouponBookVariant[];
  useSavedRevision?: boolean;
}): CouponBookDraft {
  const savedRevision = input.useSavedRevision
    ? input.draft.savedRevision
    : null;
  const rebuilt = buildInitialCouponBookDraft({
    festivalId: input.draft.festivalId,
    activityId: input.draft.activityId,
    variants: input.variants,
    participantInclusionMode:
      input.draft.globalSettings.participantInclusionMode,
    dynamicCouponsPerPage: DEFAULT_DYNAMIC_COUPONS_PER_PAGE,
    globalLayout: DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
    pdfCanvas: resolvePdfCanvasConfig(new URLSearchParams()),
  });
  return {
    ...rebuilt,
    savedRevision,
  };
}

function entryContentFingerprint(entry: DraftCouponEntry): string {
  return JSON.stringify({
    participantName: entry.participantName,
    standLabels: entry.standLabels,
    sectorName: entry.sectorName,
    promoHighlight: entry.promoHighlight,
    promoDescription: entry.promoDescription,
    promoConditions: entry.promoConditions,
    imageUrl: entry.imageUrl,
    proofStatus: entry.proofStatus,
  });
}

export function reconcileDraftWithSource(
  savedOrLocalDraft: CouponBookDraft,
  sourceDraft: CouponBookDraft,
): CouponBookReconciliation {
  const savedParticipantIds = new Set(
    Object.values(savedOrLocalDraft.entries)
      .filter((entry) => entry.type === "participant" && entry.participationId)
      .map((entry) => entry.participationId as number),
  );
  const sourceParticipantIds = new Set(
    Object.values(sourceDraft.entries)
      .filter((entry) => entry.type === "participant" && entry.participationId)
      .map((entry) => entry.participationId as number),
  );

  const newParticipationIds = [...sourceParticipantIds].filter(
    (id) => !savedParticipantIds.has(id),
  );
  const removedParticipationIds = [...savedParticipantIds].filter(
    (id) => !sourceParticipantIds.has(id),
  );
  const changedParticipationIds = [...sourceParticipantIds]
    .filter((id) => savedParticipantIds.has(id))
    .filter((id) => {
      const savedEntry =
        savedOrLocalDraft.entries[participantCouponId(id)]?.sourceSnapshot ??
        savedOrLocalDraft.entries[participantCouponId(id)];
      const sourceEntry = sourceDraft.entries[participantCouponId(id)];
      if (!savedEntry || !sourceEntry) return false;
      return (
        entryContentFingerprint(savedEntry as DraftCouponEntry) !==
        entryContentFingerprint(sourceEntry)
      );
    });

  return {
    newParticipationIds,
    removedParticipationIds,
    changedParticipationIds,
  };
}

export function mergeDraftWithSource(
  draft: CouponBookDraft,
  sourceDraft: CouponBookDraft,
  variants: CouponBookVariant[],
): CouponBookDraft {
  const reconciliation = reconcileDraftWithSource(draft, sourceDraft);
  const nextEntries: Record<string, DraftCouponEntry> = { ...draft.entries };

  for (const participationId of reconciliation.removedParticipationIds) {
    delete nextEntries[participantCouponId(participationId)];
  }

  for (const participationId of [
    ...reconciliation.newParticipationIds,
    ...reconciliation.changedParticipationIds,
  ]) {
    const couponId = participantCouponId(participationId);
    const sourceEntry = sourceDraft.entries[couponId];
    if (!sourceEntry) continue;
    const existing = nextEntries[couponId];
    nextEntries[couponId] = {
      ...sourceEntry,
      layoutOverride: existing?.layoutOverride ?? null,
    };
  }

  const mergedDraft: CouponBookDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
    entries: nextEntries,
  };

  return reflowDraftPages(
    mergedDraft,
    mergedDraft.globalSettings.dynamicCouponsPerPage,
    variants,
  );
}

export function touchDraftRevision(draft: CouponBookDraft): CouponBookDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

export function isCouponBookDraft(value: unknown): value is CouponBookDraft {
  return parseCouponBookDraft(value) !== null;
}

export function migrateStoredDraft(
  raw: unknown,
  fallback: CouponBookDraft,
): CouponBookDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const parsed = raw as Partial<CouponBookDraft>;
  if (
    parsed.schemaVersion === COUPON_BOOK_DRAFT_SCHEMA_VERSION &&
    isCouponBookDraft(parsed)
  ) {
    return parsed;
  }
  return fallback;
}

export function getEffectiveLayoutForCoupon(
  draft: CouponBookDraft,
  couponId: string | null | undefined,
): CouponTextLayoutConfig {
  if (!couponId) return draft.globalSettings.globalLayout;
  const entry = draft.entries[couponId];
  return mergeLayoutWithOverride(
    draft.globalSettings.globalLayout,
    entry?.layoutOverride,
  );
}

export function listRenderableDraftSheets(
  draft: CouponBookDraft,
  scope: CouponBookExportScope,
): Array<{
  book: DraftCouponBook;
  page: DraftCouponPage;
  courtesyEntry: DraftCouponEntry;
}> {
  const books =
    scope.type === "all"
      ? draft.books
      : draft.books.filter((book) => book.id === scope.bookId);

  const courtesyEntry = draft.entries[draft.courtesyCouponId];
  if (!courtesyEntry) return [];

  const sheets: Array<{
    book: DraftCouponBook;
    page: DraftCouponPage;
    courtesyEntry: DraftCouponEntry;
  }> = [];

  for (const book of books) {
    for (const page of getDraftBookPages(draft, book.id)) {
      sheets.push({ book, page, courtesyEntry });
    }
  }

  return sheets;
}

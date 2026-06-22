import {
  COUPON_BOOK_DRAFT_SCHEMA_VERSION,
  CouponBookDraft,
  CouponBookEditorUiState,
  migrateStoredDraft,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { parseCouponBookDraft } from "@/app/lib/festival_activites/coupon-book-draft-schema";

export type StoredCouponBookEditorState = {
  draft: CouponBookDraft;
  ui?: CouponBookEditorUiState;
};

const LEGACY_LAYOUT_KEY_PREFIX = "couponbook-layout:v1:festival:";
const DRAFT_KEY_PREFIX = `couponbook-draft:v${COUPON_BOOK_DRAFT_SCHEMA_VERSION}:festival:`;

export function getCouponBookDraftStorageKey(
  festivalId: number,
  activityId: number,
): string {
  return `${DRAFT_KEY_PREFIX}${festivalId}:activity:${activityId}`;
}

export function resolveStoredDraftAgainstServer(
  stored: CouponBookDraft,
  serverDraft: CouponBookDraft,
  serverUpdatedAt: Date | null,
): CouponBookDraft {
  const serverRevision = serverDraft.savedRevision ?? 0;
  const localRevision = stored.savedRevision ?? 0;

  if (serverRevision > localRevision) {
    return serverDraft;
  }

  if (serverRevision > 0 && serverRevision === localRevision && serverUpdatedAt) {
    const localUpdated = Date.parse(stored.updatedAt);
    const serverUpdated = serverUpdatedAt.getTime();
    if (Number.isFinite(localUpdated) && localUpdated > serverUpdated) {
      return stored;
    }
    return serverDraft;
  }

  return stored;
}

export function loadStoredCouponBookEditorState(
  festivalId: number,
  activityId: number,
  fallbackDraft: CouponBookDraft,
  options?: {
    serverUpdatedAt?: Date | null;
  },
): StoredCouponBookEditorState {
  if (typeof window === "undefined") {
    return { draft: fallbackDraft };
  }

  try {
    const raw = window.localStorage.getItem(
      getCouponBookDraftStorageKey(festivalId, activityId),
    );
    if (!raw) {
      return migrateLegacyLayoutOnlyState(festivalId, activityId, fallbackDraft);
    }
    const parsed = JSON.parse(raw) as Partial<StoredCouponBookEditorState>;
    const ui = parsed.ui;
    if (parsed.draft) {
      const stored = migrateStoredDraft(parsed.draft, fallbackDraft);
      const validStored = parseCouponBookDraft(stored);
      if (!validStored) {
        return { draft: fallbackDraft, ui };
      }

      const serverDraft = parseCouponBookDraft(fallbackDraft);
      if (serverDraft?.savedRevision) {
        return {
          draft: resolveStoredDraftAgainstServer(
            validStored,
            serverDraft,
            options?.serverUpdatedAt ?? null,
          ),
          ui,
        };
      }

      return { draft: validStored, ui };
    }
    const migrated = migrateStoredDraft(parsed, fallbackDraft);
    const validMigrated = parseCouponBookDraft(migrated);
    return {
      draft: validMigrated ?? fallbackDraft,
    };
  } catch {
    return { draft: fallbackDraft };
  }
}

function migrateLegacyLayoutOnlyState(
  festivalId: number,
  activityId: number,
  fallbackDraft: CouponBookDraft,
): StoredCouponBookEditorState {
  try {
    const legacyKey = `${LEGACY_LAYOUT_KEY_PREFIX}${festivalId}:activity:${activityId}`;
    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) return { draft: fallbackDraft };
    const parsed = JSON.parse(raw) as {
      textLayoutConfig?: CouponBookDraft["globalSettings"]["globalLayout"];
      pdfCanvasConfig?: CouponBookDraft["globalSettings"]["pdfCanvas"];
    };
    return {
      draft: {
        ...fallbackDraft,
        globalSettings: {
          ...fallbackDraft.globalSettings,
          globalLayout:
            parsed.textLayoutConfig ?? fallbackDraft.globalSettings.globalLayout,
          pdfCanvas:
            parsed.pdfCanvasConfig ?? fallbackDraft.globalSettings.pdfCanvas,
        },
      },
    };
  } catch {
    return { draft: fallbackDraft };
  }
}

export function saveStoredCouponBookEditorState(
  festivalId: number,
  activityId: number,
  state: StoredCouponBookEditorState,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      getCouponBookDraftStorageKey(festivalId, activityId),
      JSON.stringify(state),
    );
  } catch {
    // Ignore quota/private mode errors.
  }
}

export function clearStoredCouponBookEditorState(
  festivalId: number,
  activityId: number,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(
      getCouponBookDraftStorageKey(festivalId, activityId),
    );
    window.localStorage.removeItem(
      `${LEGACY_LAYOUT_KEY_PREFIX}${festivalId}:activity:${activityId}`,
    );
  } catch {
    // Ignore storage errors.
  }
}

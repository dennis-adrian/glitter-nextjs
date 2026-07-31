import type {
  OccurrenceLifecycleStatus,
  ProgramStatus,
} from "@/app/lib/programs/definitions";

/**
 * Publication, sales, and lifecycle are stored as three orthogonal facts and
 * resolved into one effective state here. Storing the PRD's six states as a
 * single enum would either drift from the configured sales window or make a
 * rescheduled occurrence unpurchasable.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §7.1.
 */
export type OccurrenceEffectiveState =
  | "draft"
  | "cancelled"
  | "completed"
  | "sales_closed"
  | "sales_not_started"
  | "on_sale";

export type OccurrenceStateInput = {
  programStatus: ProgramStatus;
  sessionStatus: ProgramStatus;
  lifecycleStatus: OccurrenceLifecycleStatus;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  salesClosedAt: Date | null;
  rescheduledAt: Date | null;
};

export type ResolvedOccurrenceState = {
  state: OccurrenceEffectiveState;
  /** Only `on_sale` accepts new purchases. */
  isPurchasable: boolean;
  /** Everything except `draft` is publicly visible. */
  isPubliclyVisible: boolean;
  /**
   * Orthogonal to `state`: a rescheduled occurrence keeps selling, and its
   * ticket holders gain the right to request a refund.
   */
  wasRescheduled: boolean;
};

export const OCCURRENCE_STATE_LABELS: Record<OccurrenceEffectiveState, string> =
  {
    draft: "Borrador",
    cancelled: "Cancelada",
    completed: "Finalizada",
    sales_closed: "Ventas cerradas",
    sales_not_started: "Ventas próximamente",
    on_sale: "En venta",
  };

/**
 * The single resolution used by public pages, the admin dashboard, and the
 * checkout guard, so display can never disagree with enforcement.
 */
export function resolveOccurrenceState(
  input: OccurrenceStateInput,
  now: Date = new Date(),
): ResolvedOccurrenceState {
  const wasRescheduled = input.rescheduledAt !== null;
  const state = resolveState(input, now);

  return {
    state,
    isPurchasable: state === "on_sale",
    isPubliclyVisible: state !== "draft",
    wasRescheduled,
  };
}

function resolveState(
  input: OccurrenceStateInput,
  now: Date,
): OccurrenceEffectiveState {
  if (input.programStatus === "draft" || input.sessionStatus === "draft") {
    return "draft";
  }

  if (input.lifecycleStatus === "cancelled") return "cancelled";
  if (input.lifecycleStatus === "completed") return "completed";

  if (input.salesClosedAt !== null) return "sales_closed";
  if (input.salesEndAt !== null && now.getTime() > input.salesEndAt.getTime()) {
    return "sales_closed";
  }

  if (
    input.salesStartAt !== null &&
    now.getTime() < input.salesStartAt.getTime()
  ) {
    return "sales_not_started";
  }

  return "on_sale";
}

/**
 * Effective venue for an occurrence: occurrence override, else session
 * override, else the program default. PRD §5.2.
 */
export function resolveEffectiveVenueId(
  occurrenceVenueId: number | null,
  sessionVenueId: number | null,
  programDefaultVenueId: number | null,
): number | null {
  return occurrenceVenueId ?? sessionVenueId ?? programDefaultVenueId;
}

export type SessionPublishBlocker =
  | "already_published"
  | "no_occurrences"
  | "no_speakers"
  | "no_venue"
  | "no_active_occurrences";

export const SESSION_PUBLISH_BLOCKER_LABELS: Record<
  SessionPublishBlocker,
  string
> = {
  already_published: "Ya está publicada",
  no_occurrences: "No tiene horarios programados",
  no_speakers: "No tiene expositores asignados",
  no_venue: "No tiene lugar definido ni lo hereda del programa",
  no_active_occurrences: "Todos sus horarios están cancelados o finalizados",
};

export type SessionPublishability =
  | { publishable: true }
  | { publishable: false; blocker: SessionPublishBlocker };

export type SessionPublishInput = {
  status: ProgramStatus;
  venueId: number | null;
  programDefaultVenueId: number | null;
  speakerCount: number;
  occurrences: {
    lifecycleStatus: OccurrenceLifecycleStatus;
    venueId: number | null;
  }[];
};

/**
 * Whether a session may be published. Used for the single-session action and
 * for bulk program publication, which must skip cancelled, completed, and
 * invalid sessions rather than overwrite them (roadmap Phase 1).
 */
export function resolveSessionPublishability(
  input: SessionPublishInput,
): SessionPublishability {
  if (input.status === "published") {
    return { publishable: false, blocker: "already_published" };
  }

  if (input.occurrences.length === 0) {
    return { publishable: false, blocker: "no_occurrences" };
  }

  const activeOccurrences = input.occurrences.filter(
    (occurrence) => occurrence.lifecycleStatus === "scheduled",
  );

  if (activeOccurrences.length === 0) {
    return { publishable: false, blocker: "no_active_occurrences" };
  }

  if (input.speakerCount === 0) {
    return { publishable: false, blocker: "no_speakers" };
  }

  const everyOccurrenceHasVenue = activeOccurrences.every(
    (occurrence) =>
      resolveEffectiveVenueId(
        occurrence.venueId,
        input.venueId,
        input.programDefaultVenueId,
      ) !== null,
  );

  if (!everyOccurrenceHasVenue) {
    return { publishable: false, blocker: "no_venue" };
  }

  return { publishable: true };
}

/**
 * Unpublishing is only safe while nothing has been sold. Phase 1 has no
 * purchases yet, so callers pass 0; the guard exists so the rule lives with the
 * other transitions rather than being invented later.
 */
export function canUnpublishSession(activePurchaseLineCount: number): boolean {
  return activePurchaseLineCount === 0;
}

/** An occurrence may only be completed once it has actually ended. */
export function canCompleteOccurrence(
  endsAt: Date,
  lifecycleStatus: OccurrenceLifecycleStatus,
  now: Date = new Date(),
): boolean {
  return lifecycleStatus === "scheduled" && now.getTime() >= endsAt.getTime();
}

export function canCancelOccurrence(
  lifecycleStatus: OccurrenceLifecycleStatus,
): boolean {
  return lifecycleStatus === "scheduled";
}

/** A cancelled or completed occurrence can no longer be moved. */
export function canRescheduleOccurrence(
  lifecycleStatus: OccurrenceLifecycleStatus,
): boolean {
  return lifecycleStatus === "scheduled";
}

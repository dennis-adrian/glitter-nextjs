import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { deriveEffectiveStandStatus } from "@/app/lib/stands/effective-status";
import type { StandStatus } from "@/app/lib/reservations/dto";

export const STAND_STATUS_POLL_INTERVAL_MS = 4000;
export const STAND_STATUS_STALE_AFTER_MS = 12_000;
export const STAND_STATUS_MAX_BACKOFF_MS = 30_000;
export const STAND_STATUS_RATE_LIMIT = {
  keyPrefix: "stand-status:user:",
  limit: 45,
  windowMs: 60_000,
} as const;

export type StandStatusDto = {
  standId: number;
  effectiveStatus: StandStatus;
  updatedAt: string | null;
};

export type StandStatusPollResult = {
  stands: StandStatusDto[];
  availableCount: number;
  version: number;
};

export function authorizeStandStatusPoll(input: {
  actor: { id: number; role: string; status: string } | null;
  enrolled: boolean;
}): "ok" | "unauthenticated" | "forbidden" {
  if (!input.actor) return "unauthenticated";
  if (canViewAdminReservationData(input.actor)) return "ok";
  if (input.actor.status !== "verified" || !input.enrolled) return "forbidden";
  return "ok";
}

export function nextPollBackoffMs(failureCount: number, intervalMs: number) {
  const exponent = Math.max(0, failureCount - 1);
  return Math.min(intervalMs * 2 ** exponent, STAND_STATUS_MAX_BACKOFF_MS);
}

export function isNewerPollVersion(incoming: number, applied: number) {
  return incoming > applied;
}

export function buildStandStatusPollResult(input: {
  stands: Array<{
    standId: number;
    storedStatus: StandStatus;
    updatedAt: Date | string | null;
  }>;
  activeHoldStandIds: ReadonlySet<number>;
  version: number;
}): StandStatusPollResult {
  const stands = input.stands.map((stand) => {
    const effectiveStatus = deriveEffectiveStandStatus(
      stand.storedStatus,
      stand.standId,
      input.activeHoldStandIds,
    );
    const updatedAt =
      stand.updatedAt instanceof Date
        ? stand.updatedAt.toISOString()
        : stand.updatedAt;
    return {
      standId: stand.standId,
      effectiveStatus,
      updatedAt,
    };
  });

  return {
    stands,
    availableCount: stands.filter((stand) => stand.effectiveStatus === "available")
      .length,
    version: input.version,
  };
}

export function mergePolledStandStatuses<
  T extends { id: number; effectiveStatus: string; status: string },
>(prev: T[], polled: StandStatusDto[]): T[] {
  if (polled.length === 0) return prev;
  const byId = new Map(polled.map((stand) => [stand.standId, stand]));
  let changed = false;
  const next = prev.map((stand) => {
    const update = byId.get(stand.id);
    if (!update || update.effectiveStatus === stand.effectiveStatus) {
      return stand;
    }
    changed = true;
    return {
      ...stand,
      effectiveStatus: update.effectiveStatus,
      status: update.effectiveStatus,
    };
  });
  return changed ? next : prev;
}

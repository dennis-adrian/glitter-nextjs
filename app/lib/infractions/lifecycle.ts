import type { InfractionStatus } from "@/app/lib/infractions/definitions";

type BuildInfractionStatusUpdateInput = {
  status: InfractionStatus;
  actorUserId: number;
  now: Date;
  resolutionNotes?: string | null;
  voidReason?: string | null;
};

const ALLOWED_TRANSITIONS: Record<InfractionStatus, InfractionStatus[]> = {
  pending: ["under_review", "resolved", "voided"],
  under_review: ["resolved", "voided", "pending"],
  resolved: ["under_review", "voided", "pending"],
  voided: ["pending", "under_review"],
};

export function canTransitionInfractionStatus(
  from: InfractionStatus,
  to: InfractionStatus,
): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertInfractionStatusTransition(
  from: InfractionStatus,
  to: InfractionStatus,
): void {
  if (!canTransitionInfractionStatus(from, to)) {
    throw new Error(`Transición de infracción inválida: ${from} → ${to}`);
  }
}

export function buildInfractionStatusUpdate({
  status,
  actorUserId,
  now,
  resolutionNotes = null,
  voidReason = null,
}: BuildInfractionStatusUpdateInput) {
  return {
    status,
    handled: status === "resolved",
    resolvedAt: status === "resolved" ? now : null,
    resolvedByUserId: status === "resolved" ? actorUserId : null,
    resolutionNotes: status === "resolved" ? resolutionNotes : null,
    voidedAt: status === "voided" ? now : null,
    voidedByUserId: status === "voided" ? actorUserId : null,
    voidReason: status === "voided" ? voidReason : null,
    updatedAt: now,
  };
}

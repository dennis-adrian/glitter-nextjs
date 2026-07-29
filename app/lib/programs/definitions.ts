import {
  programSessions,
  programSettings,
  programs,
  sessionAttendances,
  sessionOccurrenceScheduleChanges,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchases,
  sessionSpeakers,
  sessionTickets,
  speakers,
  venues,
} from "@/db/schema";

export type Venue = typeof venues.$inferSelect;
export type ProgramSettings = typeof programSettings.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type ProgramSession = typeof programSessions.$inferSelect;
export type SessionOccurrence = typeof sessionOccurrences.$inferSelect;
export type Speaker = typeof speakers.$inferSelect;
export type SessionSpeaker = typeof sessionSpeakers.$inferSelect;
export type OccurrenceScheduleChange =
  typeof sessionOccurrenceScheduleChanges.$inferSelect;

export type ProgramStatus = Program["status"];
export type SessionType = ProgramSession["type"];
export type SessionAudience = ProgramSession["audience"];
export type SessionSkillLevel = NonNullable<ProgramSession["skillLevel"]>;
export type OccurrenceLifecycleStatus = SessionOccurrence["lifecycleStatus"];

export type SessionPurchase = typeof sessionPurchases.$inferSelect;
export type SessionPurchaseLine = typeof sessionPurchaseLines.$inferSelect;
export type SessionPurchaseEvent = typeof sessionPurchaseEvents.$inferSelect;
export type SessionTicket = typeof sessionTickets.$inferSelect;
export type SessionAttendance = typeof sessionAttendances.$inferSelect;

export type SessionPurchaseStatus = SessionPurchase["status"];
export type SessionPurchasePaymentMode = SessionPurchase["paymentMode"];
export type PurchaseLineSource = SessionPurchaseLine["source"];
export type PurchaseActorType = SessionPurchaseEvent["actorType"];
export type SessionPurchaseEventType = SessionPurchaseEvent["eventType"];
export type SessionTicketStatus = SessionTicket["status"];
export type AttendanceMethod = SessionAttendance["method"];

export const SESSION_PURCHASE_STATUS_LABELS: Record<
  SessionPurchaseStatus,
  string
> = {
  pending_upload: "Esperando comprobante",
  under_verification: "En revisión",
  changes_requested: "Cambios solicitados",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export const SESSION_TICKET_STATUS_LABELS: Record<SessionTicketStatus, string> =
  {
    valid: "Válida",
    cancelled: "Cancelada",
  };

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  talk: "Charla",
  workshop: "Taller",
};

export const SESSION_AUDIENCE_LABELS: Record<SessionAudience, string> = {
  all: "Participantes activos y público general",
  participants_only: "Solo participantes activos",
  public_only: "Solo público general",
};

export const SESSION_SKILL_LEVEL_LABELS: Record<SessionSkillLevel, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

/**
 * Longest cancellation or reschedule reason. Lives here so the actions that
 * enforce it and the inputs that collect it cannot drift apart.
 */
export const OCCURRENCE_REASON_MAX = 500;

/** A speaker as shown on a session, with the join row's presentation fields. */
export type SessionSpeakerWithSpeaker = SessionSpeaker & {
  speaker: Speaker;
};

export type SessionWithOccurrences = ProgramSession & {
  occurrences: SessionOccurrence[];
  sessionSpeakers: SessionSpeakerWithSpeaker[];
  venue: Venue | null;
};

export type ProgramWithSessions = Program & {
  sessions: SessionWithOccurrences[];
  defaultVenue: Venue | null;
};

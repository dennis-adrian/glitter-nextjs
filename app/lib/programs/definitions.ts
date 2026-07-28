import {
  programSessions,
  programSettings,
  programs,
  sessionOccurrenceScheduleChanges,
  sessionOccurrences,
  sessionSpeakers,
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

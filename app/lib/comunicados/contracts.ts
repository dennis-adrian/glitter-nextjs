import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";

/**
 * What the send, the retraction and the work driver hand to the admin pages
 * (docs/IMPLEMENTATION-comunicados.md D1, F3, G5, G7). Client-safe: types and
 * constant arrays only.
 */

export type VercelEnvironment = "development" | "preview" | "production";

export const SEND_REFUSAL_CODES = [
  "NOT_FOUND",
  "STALE",
  "INVALID_CONTENT",
  "INVALID_AUDIENCE",
  "ESSENTIAL_NOT_ALLOWED",
  "BASE_URL",
  "AUDIENCE_TOO_LARGE",
  "NO_ELIGIBLE_RECIPIENTS",
  "AUDIENCE_CHANGED",
  "SENDER_NOT_ADMIN",
  "LATE",
] as const;
export type SendRefusalCode = (typeof SEND_REFUSAL_CODES)[number];

export type ComunicadoSendConfirmation = {
  comunicadoId: number;
  /** The stored version these numbers are for: the send's expectedVersion. */
  version: number;
  title: string;
  sendEmail: boolean;
  sendPush: boolean;
  essential: boolean;
  essentialReason: string | null;
  essentialFestivalName: string | null;
  preview: ComunicadoAudiencePreview;
  /**
   * People picked by name who receive it here, for G5's test-environment
   * callout; at most 10 names.
   */
  pickedReceiving: { count: number; names: string[] };
  /** eligible >= COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS, or essential. */
  typedRequired: boolean;
  env: VercelEnvironment;
  notificationsLaunched: boolean;
  /** The message the send would refuse with right now, or null. */
  problem: string | null;
};
export type LoadSendConfirmationResult =
  | { success: true; confirmation: ComunicadoSendConfirmation }
  | { success: false; message: string };
export type SendComunicadoNowInput = {
  comunicadoId: number;
  expectedVersion: number;
  typedCount: number | null;
};
export type SendComunicadoNowResult =
  | { success: true; alreadySent: boolean; message: string }
  | {
      success: false;
      code: SendRefusalCode | "INVALID" | "FORBIDDEN" | "FAILED";
      message: string;
    };

export type ComunicadoRetractCounts = {
  /** Recipients notified or still pending: whose inbox it leaves. */
  people: number;
  /** Email pending or processing, without maybe_sent_at. */
  queuedEmails: number;
  /** maybe_sent_at set and not sent. */
  maybeSentEmails: number;
  sentEmails: number;
};
export type RetractComunicadoInput = { comunicadoId: number; reason: string };
export type ComunicadoActionResult = { success: boolean; message: string };

export type ScheduleRefusalCode =
  | SendRefusalCode
  | "DEVELOPMENT"
  | "INVALID_DATE"
  | "NOT_SCHEDULED";
export type ScheduleFailureCode =
  | ScheduleRefusalCode
  | "INVALID"
  | "FORBIDDEN"
  | "FAILED";
export type ScheduleComunicadoInput = {
  comunicadoId: number;
  expectedVersion: number;
  /** ISO instant, `Date#toISOString()`. */
  scheduledAt: string;
  typedCount: number | null;
};
export type RescheduleComunicadoInput = {
  comunicadoId: number;
  expectedVersion: number;
  scheduledAt: string;
};
export type CancelComunicadoScheduleInput = { comunicadoId: number };
export type ScheduleActionResult =
  | { success: true; message: string }
  | { success: false; code: ScheduleFailureCode; message: string };

export type ComunicadoRetryCounts = {
  /** Latest email failed and maybe_sent_at null: what a retry re-sends. */
  emails: number;
  /** Recipients failed at fan-out: put back to pending. */
  people: number;
  /** Latest email failed with maybe_sent_at set: never retried (V7). */
  maybeSentEmails: number;
};
export type DuplicateComunicadoResult =
  | { success: true; comunicadoId: number }
  | { success: false; message: string };

export type EditComunicadoInput = {
  comunicadoId: number;
  expectedRevision: number;
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  editNote: string | null;
};
export type EditRefusalCode =
  | "NOT_FOUND"
  | "NOT_SENT"
  | "RETRACTED"
  | "STALE"
  | "NOTE_REQUIRED"
  | "NO_CHANGES"
  | "INVALID_CONTENT"
  | "LOCKED"
  | "BUSY";
export type EditComunicadoResult =
  | { success: true; revision: number; message: string }
  | {
      success: false;
      code: EditRefusalCode | "INVALID" | "FORBIDDEN" | "FAILED";
      message: string;
    };

export type ComunicadoRevisionView = {
  revision: number;
  title: string;
  html: string;
  actionLabel: string | null;
  actionPath: string | null;
  editNote: string | null;
  /** ISO. */
  createdAt: string;
  createdByName: string | null;
};
export type LoadComunicadoRevisionResult =
  | { success: true; revision: ComunicadoRevisionView }
  | { success: false; message: string };

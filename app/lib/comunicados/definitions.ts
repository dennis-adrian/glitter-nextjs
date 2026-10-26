import { z } from "zod";

import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";

/**
 * Limits, shapes and copy for comunicados (docs/IMPLEMENTATION-comunicados.md
 * A4, A9, B1, C6). Client-safe: the composer validates with the same schemas
 * the actions do.
 */

/** It is the email subject and the push title. */
export const COMUNICADO_TITLE_MAX = 80;
/** Plain text, about a screen of reading. */
export const COMUNICADO_TEXT_MAX = 5_000;
export const COMUNICADO_DOC_MAX_BYTES = 64 * 1024;
/** Blocks, children counted. */
export const COMUNICADO_MAX_BLOCKS = 200;
/** Lists nest this deep at most; a deeper level is lifted on save. */
export const ANNOUNCEMENT_MAX_DEPTH = 2;
/** Gmail clips a message at 102 KB. */
export const COMUNICADO_EMAIL_HTML_MAX_BYTES = 90 * 1024;
/** The inbox list clamps the body to two lines. */
export const COMUNICADO_EXCERPT_MAX = 280;
export const COMUNICADO_ACTION_LABEL_MAX = 30;
/** Festivals and saved lists together. */
export const COMUNICADO_MAX_SOURCES = 10;
export const COMUNICADO_MAX_PEOPLE = 100;
/** Eligible people, counted before a preview narrows them. */
export const COMUNICADO_MAX_RECIPIENTS = 3_000;
/** At or above this many, and always when essential, the count is typed. */
export const COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS = 300;
export const COMUNICADO_ESSENTIAL_REASON_MIN = 10;
export const COMUNICADO_ESSENTIAL_REASON_MAX = 300;
/** A finished festival can still get an essential email this long after. */
export const ESSENTIAL_FESTIVAL_GRACE_DAYS = 7;

/** Test sends: this many per admin per window. */
export const COMUNICADO_TEST_SEND_LIMIT = 5;
export const COMUNICADO_TEST_SEND_WINDOW_MS = 10 * 60_000;

/** How long the composer waits after the last keystroke before saving. */
export const COMUNICADO_AUTOSAVE_DEBOUNCE_MS = 1_500;

/** Drafts are saved half-written, so their fields are only bounded. */
const DRAFT_TITLE_MAX = 300;
const DRAFT_ACTION_LABEL_MAX = 120;
const DRAFT_ACTION_PATH_MAX = 2_000;

export const COMUNICADO_STATUSES = ["draft", "scheduled", "sent"] as const;
export type ComunicadoStatus = (typeof COMUNICADO_STATUSES)[number];

export const COMUNICADO_MISSED_REASONS = [
  "late",
  "too_large",
  "empty",
  "invalid",
  "sender_not_admin",
] as const;
export type ComunicadoMissedReason = (typeof COMUNICADO_MISSED_REASONS)[number];

/**
 * A button's path: inside Glitter, never "//host" or "/\host", and no
 * whitespace or control character, since a browser strips tabs and newlines
 * while parsing and "/\t/evil.example" would leave the site. The same rule as
 * the CHECK `comunicados_action_path_safe`.
 */
export const COMUNICADO_ACTION_PATH_PATTERN =
  /^\/(?![/\\])[^\s\x00-\x1f\x7f]*$/;

export function isSafeComunicadoActionPath(path: string) {
  return COMUNICADO_ACTION_PATH_PATTERN.test(path);
}

/** Why a typed button path is refused, or null when it is fine. */
export function comunicadoActionPathProblem(path: string): string | null {
  if (/\s/.test(path)) return "La dirección no puede tener espacios.";
  if (!isSafeComunicadoActionPath(path)) {
    return "Pegá un enlace de Glitter que empiece con /, por ejemplo /my_participations.";
  }
  return null;
}

const serialId = z.number().int().positive().max(MAX_SERIAL_ID);

function uniqueIds(max: number, tooMany: string) {
  return z
    .array(serialId)
    .max(max, tooMany)
    .default([])
    .transform((ids) => [...new Set(ids)]);
}

/**
 * Who a draft is for (B1): "Confirmados · <festival>" lists, saved lists and
 * people picked by name. Stored as is; resolved when it is used.
 */
export const ComunicadoAudienceSchema = z
  .object({
    festivals: uniqueIds(
      COMUNICADO_MAX_SOURCES,
      `Elegí hasta ${COMUNICADO_MAX_SOURCES} listas.`,
    ),
    lists: uniqueIds(
      COMUNICADO_MAX_SOURCES,
      `Elegí hasta ${COMUNICADO_MAX_SOURCES} listas.`,
    ),
    people: uniqueIds(
      COMUNICADO_MAX_PEOPLE,
      `Elegí hasta ${COMUNICADO_MAX_PEOPLE} personas por nombre.`,
    ),
  })
  .strict()
  .refine(
    (audience) =>
      audience.festivals.length + audience.lists.length <=
      COMUNICADO_MAX_SOURCES,
    `Elegí hasta ${COMUNICADO_MAX_SOURCES} listas entre festivales y guardadas.`,
  );
export type ComunicadoAudience = z.output<typeof ComunicadoAudienceSchema>;

export const EMPTY_COMUNICADO_AUDIENCE: ComunicadoAudience = {
  festivals: [],
  lists: [],
  people: [],
};

export function isEmptyComunicadoAudience(audience: ComunicadoAudience) {
  return (
    audience.festivals.length +
      audience.lists.length +
      audience.people.length ===
    0
  );
}

/** A stored audience, or null when it no longer parses. */
export function parseStoredComunicadoAudience(
  stored: unknown,
): ComunicadoAudience | null {
  const parsed = ComunicadoAudienceSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * What an autosave writes: the working copy, half-written allowed. The
 * content itself (`doc`) is checked by `normalizeAnnouncementDoc` on the
 * server, never here.
 */
export const ComunicadoDraftSchema = z.object({
  comunicadoId: serialId,
  /** The version the composer last saw; a newer one refuses the save. */
  expectedVersion: z.number().int().min(1),
  /**
   * New for each save and the same on its retries, so retrying a save that
   * committed but whose answer was lost reads as saved, not as stale.
   */
  saveKey: z.uuid(),
  title: z.string().max(DRAFT_TITLE_MAX),
  /**
   * Left out when it is far over `COMUNICADO_DOC_MAX_BYTES`, so the request
   * stays small: the stored text stays and the other fields still save.
   */
  doc: z.array(z.unknown()).optional(),
  actionLabel: z.string().max(DRAFT_ACTION_LABEL_MAX).nullable(),
  actionPath: z.string().max(DRAFT_ACTION_PATH_MAX).nullable(),
  sendEmail: z.boolean(),
  sendPush: z.boolean(),
  audience: ComunicadoAudienceSchema,
  essential: z.boolean(),
  essentialReason: z.string().max(COMUNICADO_ESSENTIAL_REASON_MAX).nullable(),
});
export type ComunicadoDraftInput = z.input<typeof ComunicadoDraftSchema>;

/** The title as it must be to send: trimmed, 1–80, one line. */
export const ComunicadoTitleSchema = z
  .string()
  .trim()
  .min(1, "Escribí un título.")
  .max(
    COMUNICADO_TITLE_MAX,
    `El título puede tener hasta ${COMUNICADO_TITLE_MAX} caracteres.`,
  )
  .refine((title) => !/[\r\n]/.test(title), "El título va en una sola línea.");

/** The optional button, as it must be to send: both fields or neither. */
export const ComunicadoActionSchema = z
  .object({
    actionLabel: z.string().trim().nullable(),
    actionPath: z.string().trim().nullable(),
  })
  .transform(({ actionLabel, actionPath }) => ({
    actionLabel: actionLabel || null,
    actionPath: actionPath || null,
  }))
  .superRefine(({ actionLabel, actionPath }, ctx) => {
    if ((actionLabel === null) !== (actionPath === null)) {
      ctx.addIssue({
        code: "custom",
        message: actionLabel
          ? "Falta la página de Glitter del botón."
          : "Falta el texto del botón.",
      });
      return;
    }
    if (actionLabel && actionLabel.length > COMUNICADO_ACTION_LABEL_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `El texto del botón puede tener hasta ${COMUNICADO_ACTION_LABEL_MAX} caracteres.`,
      });
    }
    const problem = actionPath ? comunicadoActionPathProblem(actionPath) : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const COMUNICADO_STATUS_LABELS = {
  draft: "Borrador",
  scheduled: "Programado",
  sent: "Enviado",
} as const satisfies Record<ComunicadoStatus, string>;

export const COMUNICADO_UNTITLED = "Sin título";

/** "d•••@gmail.com": the test-send toast names the inbox without spelling it out. */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}•••@${domain}`;
}

/** People per fan-out chunk: one transaction writes their inbox rows (D2). */
export const FANOUT_CHUNK = 250;
/**
 * A recipient fails for good after this many chunk failures (gifts'
 * MAX_RECIPIENT_ATTEMPTS).
 */
export const FANOUT_MAX_ATTEMPTS = 3;
/** One run of the work (D9), each under `maxDuration: 100` (vercel.json). */
export const COMUNICADOS_CRON_DEADLINE_MS = 75_000;
export const SEND_AFTER_DEADLINE_MS = 85_000;
export const PROCESS_BUTTON_DEADLINE_MS = 80_000;
/** The bulk push step's share of a run (D9 step 3). */
export const COMUNICADO_PUSH_STEP_MAX_MS = 20_000;
/** Lane-wide fan-out takes this many campaigns a run, oldest first (D9). */
export const COMUNICADO_LANE_FANOUT_LIMIT = 5;
/** Processing campaigns the lane's completion sweep checks a run (D2). */
export const COMUNICADO_COMPLETION_SWEEP_LIMIT = 20;
/** "Procesar envíos pendientes": once per 30 s across every admin (A9, D9). */
export const COMUNICADOS_PROCESS_RATE_LIMIT = {
  key: "comunicados-process",
  limit: 1,
  windowMs: 30_000,
} as const;
export const COMUNICADO_RETRACT_REASON_MAX = 300;

const summaryCount = z.number().int().min(0);
/**
 * `comunicados.audience_summary`, frozen at send (A4, B7, B8). `env` is the
 * VERCEL_ENV that wrote it: lane-wide drains take only their own (D9).
 */
export const ComunicadoAudienceSummarySchema = z.object({
  v: z.literal(1),
  env: z.enum(["development", "preview", "production"]),
  narrowed: z.boolean(),
  sources: z.array(
    z.object({
      kind: z.enum(["festival", "list", "people"]),
      id: z.number().int().nullable(),
      label: z.string(),
      matched: summaryCount,
      eligible: summaryCount,
    }),
  ),
  matched: summaryCount,
  /** "Pueden recibirlo hoy" at send, before narrowing. */
  eligible: summaryCount,
  /** Recipient rows written `pending`. */
  willReceive: summaryCount,
  stagingAdmins: summaryCount,
  pickedByName: summaryCount,
  /**
   * Skipped at the snapshot, by B5 label, most first (the staging label
   * included).
   */
  skipped: z.array(z.object({ reason: z.string(), count: summaryCount })),
  channels: z.object({ email: z.boolean(), push: z.boolean() }),
  /** Among willReceive, by B7; zeros when email was not ticked. */
  email: z.object({
    sendTo: summaryCount,
    unsubscribedAnnouncements: summaryCount,
    unsubscribedAll: summaryCount,
    suppressed: summaryCount,
    invalid: summaryCount,
  }),
  essentialFestival: z
    .object({ id: z.number().int(), name: z.string() })
    .nullable(),
  /** Top level, as runbook query I4 #6 reads them. */
  essentialOverride: summaryCount,
  essentialNotOverridden: summaryCount,
});
export type ComunicadoAudienceSummary = z.output<
  typeof ComunicadoAudienceSummarySchema
>;

export function parseComunicadoAudienceSummary(
  value: unknown,
): ComunicadoAudienceSummary | null {
  const parsed = ComunicadoAudienceSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

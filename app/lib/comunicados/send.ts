import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  type ComunicadoAudiencePreview,
  type ComunicadoSnapshotCounts,
  ESSENTIAL_NOT_ALLOWED_MESSAGE,
  type Executor,
  resolveComunicadoAudience,
  type ResolvedComunicadoAudience,
  snapshotComunicadoRecipients,
  summarizeComunicadoAudience,
} from "@/app/lib/comunicados/audience";
import type {
  SendRefusalCode,
  VercelEnvironment,
} from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_MAX_RECIPIENTS,
  COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS,
  type ComunicadoAudience,
  type ComunicadoAudienceSummary,
  isEmptyComunicadoAudience,
  parseStoredComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import type { ComunicadosTx } from "@/app/lib/comunicados/locks";
import {
  type ComunicadoSendCheck,
  validateComunicadoForSend,
} from "@/app/lib/comunicados/validate";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";
import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { blocksToSanitizedHtml } from "@/app/lib/rich-text/render";
import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import { db } from "@/db";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  users,
} from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * Starting a send (docs/IMPLEMENTATION-comunicados.md D1, B4–B8): the checks
 * under the comunicado's row lock, the campaign, the recipient snapshot,
 * revision 1 and the comunicado marked sent, all in one transaction, so a
 * refusal anywhere leaves nothing behind. Delivering it is the driver's.
 * Nothing here checks access: the actions and the release do.
 */

export const SEND_MESSAGES = {
  notFound: "No encontramos este comunicado.",
  stale:
    "El borrador cambió desde que abriste la confirmación. Revisalo y confirmá de nuevo.",
  senderNotAdmin:
    "La persona que lo programó ya no es administradora, así que no se envió.",
  unreadableAudience:
    "No pudimos leer los destinatarios guardados. Elegilos de nuevo.",
  emptyAudience: "Elegí al menos una lista o una persona.",
  baseUrl:
    "Falta configurar la dirección pública del sitio: los enlaces del correo no funcionarían.",
  noEligible: "Nadie de esta audiencia puede recibirlo.",
} as const;

/** A send that will not start, with the reason in the admin's words. */
export class SendRefusal extends Error {
  readonly code: SendRefusalCode;
  /** The snapshot's count, for the refusals taken after it; else null. */
  readonly eligible: number | null;

  constructor(
    code: SendRefusalCode,
    message: string,
    opts: { eligible?: number } = {},
  ) {
    super(message);
    this.name = "SendRefusal";
    this.code = code;
    this.eligible = opts.eligible ?? null;
  }
}

/** "Por ahora un comunicado llega a 3.000 personas como máximo…" (G5). */
export function audienceTooLargeMessage() {
  return `Por ahora un comunicado llega a ${formatAudienceCount(COMUNICADO_MAX_RECIPIENTS)} personas como máximo. Achicá la audiencia con una lista más precisa.`;
}

/** "La audiencia cambió: ahora son 1.251 personas…" (B8), or "es 1 persona". */
export function audienceChangedMessage(eligible: number) {
  const count =
    eligible === 1
      ? "ahora es 1 persona"
      : `ahora son ${formatAudienceCount(eligible)} personas`;
  return `La audiencia cambió: ${count}. Revisá y confirmá de nuevo.`;
}

/** At 300 or more who can receive it, and always when essential (B8). */
export function typedConfirmationRequired(
  eligible: number,
  essential: boolean,
) {
  return essential || eligible >= COMUNICADO_TYPE_TO_CONFIRM_RECIPIENTS;
}

/**
 * `comunicados.audience_summary` (A4, B7, B8), frozen at send. The totals and
 * the skips are the snapshot's own, so they match the recipient rows; the
 * per-source counts and the email split come from the preview counted in the
 * same transaction, for display.
 */
export function buildAudienceSummary(i: {
  env: VercelEnvironment;
  narrowed: boolean;
  preview: ComunicadoAudiencePreview;
  snapshot: ComunicadoSnapshotCounts;
  sendEmail: boolean;
  sendPush: boolean;
  essential: boolean;
}): ComunicadoAudienceSummary {
  const { email } = i.preview;
  return {
    v: 1,
    env: i.env,
    narrowed: i.narrowed,
    sources: i.preview.sources.map((source) => ({
      kind: source.kind,
      id: source.id,
      label: source.label,
      matched: source.count.eligible + source.count.skipped,
      eligible: source.count.eligible,
    })),
    matched: i.snapshot.matched,
    eligible: i.snapshot.eligible,
    willReceive: i.snapshot.willReceive,
    stagingAdmins: i.snapshot.stagingAdmins,
    pickedByName: i.snapshot.pickedByName,
    skipped: i.snapshot.skipped,
    channels: { email: i.sendEmail, push: i.sendPush },
    email: i.sendEmail
      ? {
          sendTo: email.sendTo,
          unsubscribedAnnouncements: email.unsubscribedAnnouncements,
          unsubscribedAll: email.unsubscribedAll,
          suppressed: email.suppressed,
          invalid: email.invalid,
        }
      : {
          sendTo: 0,
          unsubscribedAnnouncements: 0,
          unsubscribedAll: 0,
          suppressed: 0,
          invalid: 0,
        },
    essentialFestival: i.essential ? i.preview.essentialAllowed.festival : null,
    essentialOverride: i.essential ? email.essentialOverride : 0,
    essentialNotOverridden: i.essential
      ? email.unsubscribedAll + email.suppressed
      : 0,
  };
}

/** The working copy, as `checkComunicadoSendable` reads it. */
export type SendableComunicadoRow = {
  title: string;
  doc: unknown;
  actionLabel: string | null;
  actionPath: string | null;
  essential: boolean;
  essentialReason: string | null;
  sendEmail: boolean;
  audience: unknown;
};

export type SendableContent = Extract<ComunicadoSendCheck, { ok: true }>;

export type ComunicadoSendability =
  | {
      ok: true;
      content: SendableContent;
      audience: ComunicadoAudience;
      resolved: ResolvedComunicadoAudience;
      preview: ComunicadoAudiencePreview;
    }
  | {
      ok: false;
      refusal: SendRefusal;
      /** Zeros when there was no audience to count. */
      preview: ComunicadoAudiencePreview;
    };

const NO_AUDIENCE_PREVIEW: ComunicadoAudiencePreview = {
  sources: [],
  matched: 0,
  eligible: 0,
  overlap: 0,
  skipped: [],
  skippedTotal: 0,
  willReceive: 0,
  email: {
    sendTo: 0,
    unsubscribedAnnouncements: 0,
    unsubscribedAll: 0,
    suppressed: 0,
    invalid: 0,
    essentialOverride: 0,
  },
  pushDevices: 0,
  pushSubscriptions: 0,
  tooLarge: false,
  narrowed: false,
  stagingAdmins: 0,
  essentialAllowed: { ok: false, reason: null, festival: null },
};

/**
 * D8's send-time checks that come before the snapshot, for the send under its
 * row lock and for the confirm dialog without one: the content (C2), the
 * audience (B1, B2, V9), the essential rules (B7) and, with email, the public
 * base URL. The first refusal, in that order, is the answer; the audience is
 * counted whenever it can be, so the dialog still shows its numbers.
 */
export async function checkComunicadoSendable(
  executor: Executor,
  row: SendableComunicadoRow,
  { env, narrow }: { env: VercelEnvironment; narrow: boolean },
): Promise<ComunicadoSendability> {
  const content = await validateComunicadoForSend({
    title: row.title,
    doc: row.doc,
    actionLabel: row.actionLabel,
    actionPath: row.actionPath,
    essential: row.essential,
    essentialReason: row.essentialReason,
    sendEmail: row.sendEmail,
  });
  const audience = parseStoredComunicadoAudience(row.audience);
  const counted =
    audience && !isEmptyComunicadoAudience(audience)
      ? {
          resolved: await resolveComunicadoAudience(executor, audience, {
            narrow,
          }),
          preview: await summarizeComunicadoAudience(executor, audience, {
            narrow,
            essential: row.essential,
            sendEmail: row.sendEmail,
          }),
        }
      : null;
  const preview = counted?.preview ?? NO_AUDIENCE_PREVIEW;
  const refused = (code: SendRefusalCode, message: string) => ({
    ok: false as const,
    refusal: new SendRefusal(code, message),
    preview,
  });

  if (!content.ok) return refused("INVALID_CONTENT", content.message);
  if (!audience) {
    return refused("INVALID_AUDIENCE", SEND_MESSAGES.unreadableAudience);
  }
  if (!counted) return refused("INVALID_AUDIENCE", SEND_MESSAGES.emptyAudience);
  if (counted.resolved.problem) {
    return refused("INVALID_AUDIENCE", counted.resolved.problem);
  }
  if (row.essential && !preview.essentialAllowed.ok) {
    return refused("ESSENTIAL_NOT_ALLOWED", ESSENTIAL_NOT_ALLOWED_MESSAGE);
  }
  if (row.sendEmail) {
    const problem = emailBaseUrlProblem(publicBaseUrl(), env);
    if (problem) {
      console.error("[comunicados] email links would not work:", problem);
      return refused("BASE_URL", SEND_MESSAGES.baseUrl);
    }
  }
  return {
    ok: true,
    content,
    audience,
    resolved: counted.resolved,
    preview,
  };
}

/**
 * "Enviar ahora" carries the version the dialog showed and the count typed in
 * it; a release (PR 6) carries neither: the schedule recorded its confirmation.
 */
export type StartComunicadoSendOptions =
  | {
      by: number;
      trigger: "now";
      expectedVersion: number;
      typedCount: number | null;
    }
  | { by: number; trigger: "schedule" };

export type StartComunicadoSendResult =
  | {
      kind: "started";
      comunicadoId: number;
      campaignId: number;
      eligible: number;
      willReceive: number;
      skipped: number;
      narrowed: boolean;
    }
  | { kind: "already_sent"; comunicadoId: number; campaignId: number | null }
  /** A release that found it no longer scheduled, or not due yet. */
  | { kind: "not_due" };

/** What "Enviar ahora" can hear: it has no due time to miss. */
export type SendNowResult = Exclude<
  StartComunicadoSendResult,
  { kind: "not_due" }
>;

async function isAdmin(tx: ComunicadosTx, userId: number | null) {
  if (userId === null) return false;
  const [user] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.role === "admin";
}

/**
 * D1, in the caller's transaction: "Enviar ahora" runs it inside its own,
 * the release inside the one that holds its claim. Every refusal is a thrown
 * `SendRefusal`, so the campaign and the snapshot roll back with it.
 *
 * Whether the lists narrow to the admins is this server's own environment,
 * read here and never taken from the client (B6). The cap, "nobody can
 * receive it" and the typed count are judged on the count before narrowing,
 * so a preview refuses exactly what production would.
 */
export async function startComunicadoSend(
  tx: ComunicadosTx,
  comunicadoId: number,
  opts: Extract<StartComunicadoSendOptions, { trigger: "now" }>,
): Promise<SendNowResult>;
export async function startComunicadoSend(
  tx: ComunicadosTx,
  comunicadoId: number,
  opts: StartComunicadoSendOptions,
): Promise<StartComunicadoSendResult>;
export async function startComunicadoSend(
  tx: ComunicadosTx,
  comunicadoId: number,
  opts: StartComunicadoSendOptions,
): Promise<StartComunicadoSendResult> {
  const [row] = await tx
    .select({
      id: comunicados.id,
      status: comunicados.status,
      version: comunicados.version,
      title: comunicados.title,
      doc: comunicados.doc,
      actionLabel: comunicados.actionLabel,
      actionPath: comunicados.actionPath,
      sendEmail: comunicados.sendEmail,
      sendPush: comunicados.sendPush,
      audience: comunicados.audience,
      essential: comunicados.essential,
      essentialReason: comunicados.essentialReason,
      scheduledByUserId: comunicados.scheduledByUserId,
      campaignId: comunicados.campaignId,
      // The database's clock, as the release's own claim reads it.
      due: sql<boolean>`coalesce(${comunicados.scheduledAt} <= now(), false)`,
    })
    .from(comunicados)
    .where(eq(comunicados.id, comunicadoId))
    .limit(1)
    .for("update");
  if (!row) throw new SendRefusal("NOT_FOUND", SEND_MESSAGES.notFound);

  if (opts.trigger === "now") {
    // Before the version: a double click is one send, and the second click
    // hears that it is on its way.
    if (row.status === "sent") {
      return {
        kind: "already_sent",
        comunicadoId: row.id,
        campaignId: row.campaignId,
      };
    }
    if (row.version !== opts.expectedVersion) {
      throw new SendRefusal("STALE", SEND_MESSAGES.stale);
    }
  } else {
    if (row.status !== "scheduled" || !row.due) return { kind: "not_due" };
    if (!(await isAdmin(tx, row.scheduledByUserId))) {
      throw new SendRefusal("SENDER_NOT_ADMIN", SEND_MESSAGES.senderNotAdmin);
    }
  }

  const env = serverEnv.VERCEL_ENV;
  const check = await checkComunicadoSendable(tx, row, {
    env,
    narrow: env !== "production",
  });
  if (!check.ok) throw check.refusal;
  const { content, resolved, preview } = check;
  const html = await blocksToSanitizedHtml(content.blocks, "announcement");

  // The key is unique across campaign types: one campaign per comunicado.
  const [campaign] = await tx
    .insert(notificationCampaigns)
    .values({
      type: "comunicado",
      status: "processing",
      title: content.title,
      message: content.text,
      createdByUserId: opts.by,
      idempotencyKey: `comunicado:${row.id}`,
    })
    .returning({ id: notificationCampaigns.id });
  const campaignId = campaign!.id;

  const snapshot = await snapshotComunicadoRecipients(
    tx,
    campaignId,
    resolved.input,
  );
  const { eligible } = snapshot;
  const refusal = (code: SendRefusalCode, message: string) =>
    new SendRefusal(code, message, { eligible });
  if (eligible > COMUNICADO_MAX_RECIPIENTS) {
    throw refusal("AUDIENCE_TOO_LARGE", audienceTooLargeMessage());
  }
  if (eligible === 0) {
    throw refusal("NO_ELIGIBLE_RECIPIENTS", SEND_MESSAGES.noEligible);
  }
  // A missing count where one is required is a mismatch too. Below the
  // threshold a small drift since the dialog opened is accepted.
  if (
    opts.trigger === "now" &&
    typedConfirmationRequired(eligible, row.essential) &&
    opts.typedCount !== eligible
  ) {
    throw refusal("AUDIENCE_CHANGED", audienceChangedMessage(eligible));
  }

  await tx.insert(comunicadoRevisions).values({
    comunicadoId: row.id,
    revision: 1,
    title: content.title,
    doc: content.blocks,
    html,
    text: content.text,
    actionLabel: content.actionLabel,
    actionPath: content.actionPath,
    createdByUserId: opts.by,
  });

  // "Enviar ahora" records who confirmed an essential send; a schedule
  // already did, at "Programar".
  const essentialConfirmation =
    opts.trigger === "schedule"
      ? {}
      : row.essential
        ? {
            essentialConfirmedByUserId: opts.by,
            essentialConfirmedAt: sql`now()`,
          }
        : { essentialConfirmedByUserId: null, essentialConfirmedAt: null };
  await tx
    .update(comunicados)
    .set({
      status: "sent",
      campaignId,
      currentRevision: 1,
      sentAt: sql`now()`,
      sentByUserId: opts.by,
      audienceSummary: buildAudienceSummary({
        env,
        narrowed: preview.narrowed,
        preview,
        snapshot,
        sendEmail: row.sendEmail,
        sendPush: row.sendPush,
        essential: row.essential,
      }),
      // The working copy as sent, so the list pages show revision 1's title
      // and the CHECKs that spare drafts hold from here on.
      title: content.title,
      actionLabel: content.actionLabel,
      actionPath: content.actionPath,
      essentialReason: content.essentialReason,
      ...essentialConfirmation,
      // A draft back from a missed schedule can be sent.
      scheduleMissedAt: null,
      scheduleMissedReason: null,
      scheduleMissedDetail: null,
      version: sql`${comunicados.version} + 1`,
      updatedAt: sql`now()`,
      updatedByUserId: opts.by,
    })
    .where(eq(comunicados.id, row.id));

  return {
    kind: "started",
    comunicadoId: row.id,
    campaignId,
    eligible,
    willReceive: snapshot.willReceive,
    skipped: snapshot.skipped.reduce((sum, entry) => sum + entry.count, 0),
    narrowed: preview.narrowed,
  };
}

/** A deletion committing under the snapshot, or a deadlock (B4). */
const RETRIED_SQLSTATES = ["23503", "40P01"];

/**
 * D1's one retry: a profile deletion that commits while the snapshot waits on
 * its user (23503), or a deadlock (40P01), rolls the whole send back, and the
 * second try finds the person gone. Anything else, a refusal included, is the
 * answer.
 */
export async function withSendRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!hasPgErrorCode(error, ...RETRIED_SQLSTATES)) throw error;
    return run();
  }
}

/** "Enviar ahora", in its own transaction. Logs ids and counts only (I4). */
export async function sendComunicadoNow(i: {
  comunicadoId: number;
  by: number;
  expectedVersion: number;
  typedCount: number | null;
}): Promise<SendNowResult> {
  const result = await withSendRetry(() =>
    db.transaction((tx) =>
      startComunicadoSend(tx, i.comunicadoId, {
        by: i.by,
        trigger: "now",
        expectedVersion: i.expectedVersion,
        typedCount: i.typedCount,
      }),
    ),
  );
  if (result.kind === "started") {
    console.log("[comunicados] send", {
      comunicadoId: result.comunicadoId,
      eligible: result.eligible,
      skipped: result.skipped,
      narrowed: result.narrowed,
    });
  }
  return result;
}

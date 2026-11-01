import "server-only";

import { sql } from "drizzle-orm";

import {
  type ComunicadoAudiencePreview,
  type Executor,
  resolveComunicadoAudience,
  type ResolvedComunicadoAudience,
  snapshotComunicadoRecipients,
  summarizeComunicadoAudience,
} from "@/app/lib/comunicados/audience";
import type {
  ComunicadoResendPreview,
  ResendRefusalCode,
  VercelEnvironment,
} from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_MAX_RECIPIENTS,
  type ComunicadoAudience,
  type ComunicadoAudienceSummary,
  type ComunicadoResendSummary,
  parseComunicadoAudienceSummary,
  parseStoredComunicadoAudience,
} from "@/app/lib/comunicados/definitions";
import {
  type ComunicadosTx,
  lockComunicadoShared,
} from "@/app/lib/comunicados/locks";
import {
  audienceChangedMessage,
  audienceTooLargeMessage,
  SEND_MESSAGES,
  typedConfirmationRequired,
  withSendRetry,
} from "@/app/lib/comunicados/send";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";
import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import { db } from "@/db";
import { serverEnv } from "@/env";

/**
 * "Enviar a más personas" on a sent comunicado
 * (docs/IMPLEMENTATION-comunicados.md G10): the same comunicado, in its
 * current revision, to people who have no recipient row in its campaign yet.
 * They are either new to the original audience (its festivals and lists
 * resolved again, today) or picked by name, or both. Their rows join the same
 * campaign, marked with the resend that wrote them, so the fan-out, the bulk
 * email and push lanes, the edit, the retraction and the report all treat
 * them as they treat everyone else; `unique(campaign_id, user_id)` keeps
 * anyone from getting it twice. Nothing here checks access: the actions do.
 */

export type ResendRequest = {
  /** Re-resolve the original audience for people new to it. */
  includeAudience: boolean;
  /** Glitter users picked by name for this resend. */
  people: readonly number[];
  sendEmail: boolean;
  sendPush: boolean;
};

export const RESEND_MESSAGES = {
  NOT_FOUND: "No encontramos este comunicado.",
  NOT_SENT: "Este comunicado todavía no se envió.",
  RETRACTED: "Este comunicado fue retirado: no se puede enviar a más personas.",
  OTHER_ENV:
    "Este comunicado se envió desde otro entorno: envialo a más personas desde allí.",
  EMPTY:
    "Elegí a quién enviárselo: las personas nuevas en la audiencia o alguien por nombre.",
  ESSENTIAL_PEOPLE:
    "A un comunicado esencial no se le pueden agregar personas por nombre: duplicalo para enviarlo a otras personas.",
  INVALID_AUDIENCE: SEND_MESSAGES.unreadableAudience,
  BASE_URL: SEND_MESSAGES.baseUrl,
  NOBODY: "No hay nadie nuevo que pueda recibirlo.",
  AUDIENCE_TOO_LARGE: "",
  AUDIENCE_CHANGED: "",
  ESSENTIAL_CHANGED:
    "Cambió si este envío puede ser esencial (hasta 7 días después del festival). Revisá y confirmá de nuevo.",
  LOCKED: "No pudimos enviarlo ahora. Probá de nuevo en unos segundos.",
} as const satisfies Record<ResendRefusalCode, string>;

/** A resend that will not happen, with the reason in the admin's words. */
export class ResendRefusal extends Error {
  readonly code: ResendRefusalCode;
  constructor(code: ResendRefusalCode, message?: string) {
    super(message ?? RESEND_MESSAGES[code]);
    this.name = "ResendRefusal";
    this.code = code;
  }
}

/** The sent comunicado as a resend reads it. */
type SentComunicado = {
  id: number;
  status: string;
  campaignId: number | null;
  retracted: boolean;
  audience: unknown;
  essential: boolean;
  currentRevision: number | null;
  summary: ComunicadoAudienceSummary | null;
  rawSummary: unknown;
  sendEmail: boolean;
  sendPush: boolean;
};

async function readSent(
  executor: Executor,
  comunicadoId: number,
): Promise<SentComunicado | null> {
  const { rows } = await executor.execute<{
    id: number;
    status: string;
    campaign_id: number | null;
    retracted: boolean;
    audience: unknown;
    essential: boolean;
    current_revision: number | null;
    audience_summary: unknown;
    send_email: boolean;
    send_push: boolean;
  }>(sql`
    SELECT id, status, campaign_id, retracted_at IS NOT NULL AS retracted,
      audience, essential, current_revision, audience_summary,
      send_email, send_push
    FROM comunicados WHERE id = ${comunicadoId}::int
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    campaignId: row.campaign_id == null ? null : Number(row.campaign_id),
    retracted: row.retracted === true,
    audience: row.audience,
    essential: row.essential === true,
    currentRevision:
      row.current_revision == null ? null : Number(row.current_revision),
    summary: parseComunicadoAudienceSummary(row.audience_summary),
    rawSummary: row.audience_summary,
    sendEmail: row.send_email === true,
    sendPush: row.send_push === true,
  };
}

/**
 * Who a resend resolves: the original audience with the people picked now
 * added to its own, or only the people picked now. Everyone already in the
 * campaign drops out of every count (`excludeCampaignId`), so the original
 * people picked by name, who all have a row, add nobody.
 */
export function resendAudienceOf(
  stored: ComunicadoAudience,
  request: Pick<ResendRequest, "includeAudience" | "people">,
): ComunicadoAudience {
  if (!request.includeAudience) {
    return { festivals: [], lists: [], people: [...new Set(request.people)] };
  }
  return {
    festivals: stored.festivals,
    lists: stored.lists,
    people: [...new Set([...stored.people, ...request.people])],
  };
}

type CheckedResend = {
  comunicado: SentComunicado & { campaignId: number; currentRevision: number };
  resolved: ResolvedComunicadoAudience;
  preview: ComunicadoAudiencePreview;
  /** Lifts the Anuncios opt-out for the festival's newcomers (B7). */
  essential: boolean;
  /** Essential, but the festival ended more than 7 days ago: goes out normal. */
  essentialLapsed: boolean;
  /** Can receive it, before narrowing: new to the audience / picked now. */
  newcomers: number;
  pickedByName: number;
};

/**
 * Every check a resend makes before it writes, for the dialog without a lock
 * and for the resend under its own: the comunicado's state, the request, the
 * audience (V9), the base URL with email, and the counts. Throws the first
 * `ResendRefusal`; the counts' own refusals (nobody, too many) are the
 * caller's, so the dialog can still show its numbers.
 */
async function checkResend(
  executor: Executor,
  comunicado: SentComunicado | null,
  request: ResendRequest,
  { env, narrow }: { env: VercelEnvironment; narrow: boolean },
): Promise<CheckedResend> {
  if (!comunicado) throw new ResendRefusal("NOT_FOUND");
  if (
    comunicado.status !== "sent" ||
    comunicado.campaignId === null ||
    comunicado.currentRevision === null
  ) {
    throw new ResendRefusal("NOT_SENT");
  }
  if (comunicado.retracted) throw new ResendRefusal("RETRACTED");
  // The work after it drains the campaign with this server's narrowing, and
  // development only simulates, as for "Reintentar fallidos" (D9).
  if (comunicado.summary?.env !== env) throw new ResendRefusal("OTHER_ENV");
  if (comunicado.essential && request.people.length > 0) {
    throw new ResendRefusal("ESSENTIAL_PEOPLE");
  }
  if (!request.includeAudience && request.people.length === 0) {
    throw new ResendRefusal("EMPTY");
  }
  const stored = parseStoredComunicadoAudience(comunicado.audience);
  if (!stored) throw new ResendRefusal("INVALID_AUDIENCE");
  if (request.sendEmail) {
    const problem = emailBaseUrlProblem(publicBaseUrl(), env);
    if (problem) {
      console.error("[comunicados] email links would not work:", problem);
      throw new ResendRefusal("BASE_URL");
    }
  }

  const audience = resendAudienceOf(stored, request);
  const campaignId = comunicado.campaignId;
  const resolved = await resolveComunicadoAudience(executor, audience, {
    narrow,
  });
  // A list that can no longer be read refuses, as at the send: it never
  // quietly changes who it reaches (V9).
  if (resolved.problem) {
    throw new ResendRefusal("INVALID_AUDIENCE", resolved.problem);
  }
  resolved.input.excludeCampaignId = campaignId;

  // Essential stays essential only for the festival's newcomers, by email,
  // and inside the window judged now (B7); people by name were refused above.
  const wantsEssential =
    comunicado.essential && request.includeAudience && request.sendEmail;
  const preview = await summarizeComunicadoAudience(executor, audience, {
    narrow,
    essential: wantsEssential,
    sendEmail: request.sendEmail,
    excludeCampaignId: campaignId,
  });
  const essential = wantsEssential && preview.essentialAllowed.ok;
  const picked =
    preview.sources.find((source) => source.kind === "people")?.count
      .eligible ?? 0;
  const pickedByName = request.people.length > 0 ? picked : 0;

  return {
    comunicado: {
      ...comunicado,
      campaignId,
      currentRevision: comunicado.currentRevision,
    },
    resolved,
    preview,
    essential,
    essentialLapsed: wantsEssential && !essential,
    newcomers: request.includeAudience ? preview.eligible - pickedByName : 0,
    pickedByName,
  };
}

/** The counts' refusals, or null when they allow the resend. */
function countProblem(eligible: number): ResendRefusal | null {
  if (eligible > COMUNICADO_MAX_RECIPIENTS) {
    return new ResendRefusal("AUDIENCE_TOO_LARGE", audienceTooLargeMessage());
  }
  if (eligible === 0) return new ResendRefusal("NOBODY");
  return null;
}

/**
 * The dialog's numbers (G10), read without a lock: the resend counts it all
 * again under its own. A refusal the resend would answer now is `problem`.
 */
export async function previewComunicadoResend(
  comunicadoId: number,
  request: ResendRequest,
): Promise<ComunicadoResendPreview> {
  const env = serverEnv.VERCEL_ENV;
  const narrow = env !== "production";
  const comunicado = await readSent(db, comunicadoId);
  // The channels the original went with: the dialog starts from them.
  const original = {
    sendEmail: comunicado?.sendEmail ?? false,
    sendPush: comunicado?.sendPush ?? false,
  };
  try {
    const checked = await checkResend(db, comunicado, request, {
      env,
      narrow,
    });
    const { preview } = checked;
    return {
      ok: true,
      original,
      originalEssential: checked.comunicado.essential,
      currentRevision: checked.comunicado.currentRevision,
      newcomers: checked.newcomers,
      pickedByName: checked.pickedByName,
      eligible: preview.eligible,
      willReceive: preview.willReceive,
      notReceiving: preview.skipped.filter(
        (entry) => entry.reason !== COMUNICADO_SKIP_REASONS.staging,
      ),
      narrowed: preview.narrowed,
      stagingAdmins: preview.stagingAdmins,
      email: preview.email,
      pushDevices: preview.pushDevices,
      pushSubscriptions: preview.pushSubscriptions,
      essential: checked.essential,
      essentialLapsed: checked.essentialLapsed,
      typedRequired: typedConfirmationRequired(
        preview.eligible,
        checked.essential,
      ),
      env,
      problem: countProblem(preview.eligible)?.message ?? null,
    };
  } catch (error) {
    if (!(error instanceof ResendRefusal)) throw error;
    return {
      ok: false,
      original,
      originalEssential: comunicado?.essential ?? false,
      code: error.code,
      problem: error.message,
    };
  }
}

export type ResendComunicadoOptions = ResendRequest & {
  by: number;
  /** Minted when the dialog opened: a second submit is the same resend. */
  requestKey: string;
  /** What the dialog showed; a change since refuses. */
  expectEssential: boolean;
  typedCount: number | null;
};

export type ResendComunicadoResult =
  | {
      kind: "resent";
      comunicadoId: number;
      campaignId: number;
      resendId: number;
      willReceive: number;
      eligible: number;
      essential: boolean;
    }
  | { kind: "already_resent"; comunicadoId: number; campaignId: number };

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/** `audience_summary.resends` with this one added (G10). */
export function addResendToSummary(
  raw: unknown,
  resend: Pick<
    ComunicadoResendSummary,
    | "willReceive"
    | "pickedByName"
    | "essentialOverride"
    | "essentialNotOverridden"
  >,
): Record<string, unknown> | null {
  if (raw === null || typeof raw !== "object") return null;
  const summary = raw as Record<string, unknown>;
  const parsed = parseComunicadoAudienceSummary(raw);
  const before = parsed?.resends ?? {
    count: 0,
    willReceive: 0,
    pickedByName: 0,
    essentialOverride: 0,
    essentialNotOverridden: 0,
  };
  return {
    ...summary,
    resends: {
      count: before.count + 1,
      willReceive: before.willReceive + resend.willReceive,
      pickedByName: before.pickedByName + resend.pickedByName,
      essentialOverride: before.essentialOverride + resend.essentialOverride,
      essentialNotOverridden:
        before.essentialNotOverridden + resend.essentialNotOverridden,
    },
  };
}

/**
 * G10's statements, in this order: the content lock shared (so a retraction
 * or an edit and this serialize, and whichever comes second sees the other),
 * the checks, the campaign row (a second resend and a completion wait here),
 * the record, the snapshot, the campaign reopened and the summary.
 */
async function resendInTransaction(
  tx: ComunicadosTx,
  comunicadoId: number,
  opts: ResendComunicadoOptions,
): Promise<ResendComunicadoResult> {
  await tx.execute(sql`SET LOCAL lock_timeout = '20s'`);
  await lockComunicadoShared(tx, comunicadoId);

  const env = serverEnv.VERCEL_ENV;
  const narrow = env !== "production";
  const comunicado = await readSent(tx, comunicadoId);
  if (comunicado?.campaignId != null) {
    await tx.execute(sql`
      SELECT id FROM notification_campaigns
      WHERE id = ${comunicado.campaignId}::int
      FOR UPDATE
    `);
    // A double submit, or a retry whose answer was lost: one resend.
    const { rows: earlier } = await tx.execute<{ id: number }>(sql`
      SELECT id FROM comunicado_resends
      WHERE request_key = ${opts.requestKey}::text
        AND comunicado_id = ${comunicadoId}::int
    `);
    if (earlier[0]) {
      return {
        kind: "already_resent",
        comunicadoId,
        campaignId: comunicado.campaignId,
      };
    }
  }

  const checked = await checkResend(tx, comunicado, opts, { env, narrow });
  const { preview, essential } = checked;
  const { campaignId, currentRevision } = checked.comunicado;
  if (essential !== opts.expectEssential) {
    throw new ResendRefusal("ESSENTIAL_CHANGED");
  }

  const [resend] = (
    await tx.execute<{ id: number }>(sql`
      INSERT INTO comunicado_resends
        (comunicado_id, request_key, includes_audience, people, send_email,
         send_push, essential, essential_confirmed_by_user_id, revision,
         summary, created_by_user_id)
      VALUES (${comunicadoId}::int, ${opts.requestKey}::text,
        ${opts.includeAudience}::boolean,
        to_jsonb(${intArray([...new Set(opts.people)])}),
        ${opts.sendEmail}::boolean, ${opts.sendPush}::boolean,
        ${essential}::boolean,
        ${essential ? opts.by : null}::int,
        ${currentRevision}::int, '{}'::jsonb, ${opts.by}::int)
      RETURNING id
    `)
  ).rows;
  const resendId = Number(resend!.id);

  const snapshot = await snapshotComunicadoRecipients(
    tx,
    campaignId,
    checked.resolved.input,
    { resendId },
  );
  const { eligible } = snapshot;
  const problem = countProblem(eligible);
  if (problem) throw problem;
  if (
    typedConfirmationRequired(eligible, essential) &&
    opts.typedCount !== eligible
  ) {
    throw new ResendRefusal(
      "AUDIENCE_CHANGED",
      audienceChangedMessage(eligible),
    );
  }

  const { email } = preview;
  const summary: ComunicadoResendSummary = {
    v: 1,
    env,
    narrowed: preview.narrowed,
    newcomers: Math.max(0, eligible - checked.pickedByName),
    pickedByName: snapshot.pickedByName,
    eligible,
    willReceive: snapshot.willReceive,
    stagingAdmins: snapshot.stagingAdmins,
    stagingSkipped:
      snapshot.skipped.find(
        (entry) => entry.reason === COMUNICADO_SKIP_REASONS.staging,
      )?.count ?? 0,
    channels: { email: opts.sendEmail, push: opts.sendPush },
    email: opts.sendEmail
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
    essentialOverride: essential ? email.essentialOverride : 0,
    essentialNotOverridden: essential
      ? email.unsubscribedAll + email.suppressed
      : 0,
  };
  await tx.execute(sql`
    UPDATE comunicado_resends SET summary = ${JSON.stringify(summary)}::jsonb
    WHERE id = ${resendId}::int
  `);

  // Reopened, as a retry reopens it: the completion waits for these rows.
  await tx.execute(sql`
    UPDATE notification_campaigns
    SET status = 'processing', completed_at = NULL, updated_at = now()
    WHERE id = ${campaignId}::int
  `);
  const nextSummary = addResendToSummary(
    checked.comunicado.rawSummary,
    summary,
  );
  if (nextSummary) {
    await tx.execute(sql`
      UPDATE comunicados
      SET audience_summary = ${JSON.stringify(nextSummary)}::jsonb
      WHERE id = ${comunicadoId}::int
    `);
  }

  return {
    kind: "resent",
    comunicadoId,
    campaignId,
    resendId,
    willReceive: snapshot.willReceive,
    eligible,
    essential,
  };
}

/**
 * "Enviar a más personas" (G10), in its own transaction. A deadlock or a
 * profile deletion committing under the snapshot (40P01, 23503) retries
 * once; a lock held past the timeout answers "probá de nuevo". Logs ids and
 * counts only (I4).
 */
export async function resendComunicado(
  comunicadoId: number,
  opts: ResendComunicadoOptions,
): Promise<ResendComunicadoResult> {
  let result: ResendComunicadoResult;
  try {
    result = await withSendRetry(() =>
      db.transaction((tx) => resendInTransaction(tx, comunicadoId, opts)),
    );
  } catch (error) {
    if (hasPgErrorCode(error, "55P03")) throw new ResendRefusal("LOCKED");
    throw error;
  }
  if (result.kind === "resent") {
    console.log("[comunicados] resend", {
      comunicadoId,
      campaignId: result.campaignId,
      resendId: result.resendId,
      eligible: result.eligible,
      willReceive: result.willReceive,
      essential: result.essential,
    });
  }
  return result;
}

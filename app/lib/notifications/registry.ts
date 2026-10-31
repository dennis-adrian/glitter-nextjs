import "server-only";

import { z } from "zod";

import { formatCreditCount, formatCredits } from "@/app/lib/credits/format";
import CreditGiftReceivedEmail from "@/app/emails/credit-gift-received";
import CreditGiftRevokedEmail from "@/app/emails/credit-gift-revoked";
import { comunicadoKinds } from "@/app/lib/notifications/kinds/comunicado";
import { disciplinaryKinds } from "@/app/lib/notifications/kinds/disciplinary";
import { reservationOutboxKinds } from "@/app/lib/notifications/kinds/reservation-outbox";
import type {
  EmailCopy,
  InAppCopy,
  KindDefinition,
} from "@/app/lib/notifications/kinds/types";

export type { EmailCopy, InAppCopy } from "@/app/lib/notifications/kinds/types";

/**
 * Every kind of notification, with its copy defined once: the inbox item and,
 * when it has one, the email. Both render from the same stored snapshot, so a
 * retry or a re-send says exactly what the first send said.
 *
 * The phase 2 mirrors live in `kinds/`, one module per outbox. They have no
 * email here: their outbox still sends it.
 */

const PRODUCTORA_FROM = "Productora Glitter <creditos@productoraglitter.com>";

const creditGiftReceivedSchema = z.object({
  campaignId: z.number().int().positive(),
  name: z.string().nullable(),
  amount: z.number().positive(),
  title: z.string(),
  message: z.string(),
});

const creditGiftRevokedSchema = z.object({
  campaignId: z.number().int().positive(),
  name: z.string().nullable(),
  amount: z.number().positive(),
  title: z.string(),
  debtAmount: z.number().min(0),
});

const creditGiftCompletedSchema = z.object({
  campaignId: z.number().int().positive(),
  title: z.string(),
  /** Closed by a "Retirar a todos", not by everyone being credited. */
  withdrawn: z.boolean().default(false),
  /** Still holding it. */
  granted: z.number().int().min(0),
  /** Credited, then taken back. */
  revoked: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  /** What the people in `granted` hold between them. */
  totalGranted: z.number().min(0),
});

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const kinds = {
  credit_gift_received: {
    category: "credits",
    schema: creditGiftReceivedSchema,
    inApp: (data) => ({
      title: `Recibiste ${formatCreditCount(data.amount)} de regalo`,
      body: data.message,
      actionPath: "/my_credits",
      actionLabel: "Ver mi billetera",
    }),
    email: (data) => ({
      from: PRODUCTORA_FROM,
      subject: `Recibiste ${formatCreditCount(data.amount)} de regalo`,
      react: CreditGiftReceivedEmail({
        name: data.name,
        amount: data.amount,
        title: data.title,
        message: data.message,
      }),
    }),
    creditDelta: (data) => data.amount,
    // A message someone wrote: read whole on its own page.
    opensDetail: () => true,
    push: true,
  } satisfies KindDefinition<z.infer<typeof creditGiftReceivedSchema>>,

  credit_gift_revoked: {
    category: "credits",
    schema: creditGiftRevokedSchema,
    inApp: (data) => ({
      title: "Ajustamos tu saldo de créditos",
      // No article before the count ("los 1 crédito"), and no guess at why a
      // balance ended negative: it may have been negative before the gift.
      body:
        data.debtAmount > 0
          ? `Retiramos de tu billetera el regalo «${data.title}» (${formatCreditCount(data.amount)}). Con este ajuste te queda un saldo pendiente de ${formatCreditCount(data.debtAmount)}: hasta regularizarlo no vas a poder usar créditos.`
          : `Retiramos de tu billetera el regalo «${data.title}» (${formatCreditCount(data.amount)}).`,
      actionPath: "/my_credits",
      actionLabel: "Ver mi billetera",
    }),
    email: (data) => ({
      from: PRODUCTORA_FROM,
      subject: "Ajustamos tu saldo de créditos",
      react: CreditGiftRevokedEmail({
        name: data.name,
        amount: data.amount,
        title: data.title,
        debtAmount: data.debtAmount,
      }),
    }),
    creditDelta: (data) => -data.amount,
    // Names the gift an admin titled, and any debt: read on its own page,
    // and kept off a lock screen.
    opensDetail: () => true,
    push: true,
  } satisfies KindDefinition<z.infer<typeof creditGiftRevokedSchema>>,

  /** To the admin who sent a gift, once every recipient is processed. */
  credit_gift_completed: {
    category: "admin",
    schema: creditGiftCompletedSchema,
    inApp: (data) => {
      const parts: string[] = [];
      if (data.granted > 0 || (!data.withdrawn && data.revoked === 0)) {
        parts.push(countLabel(data.granted, "acreditado", "acreditados"));
      }
      if (data.revoked > 0) {
        parts.push(countLabel(data.revoked, "retirado", "retirados"));
      }
      if (data.skipped > 0) {
        parts.push(
          data.withdrawn
            ? countLabel(
                data.skipped,
                "omitido o cancelado",
                "omitidos o cancelados",
              )
            : countLabel(data.skipped, "omitido", "omitidos"),
        );
      }
      if (data.failed > 0) {
        parts.push(countLabel(data.failed, "con error", "con error"));
      }
      return {
        title: data.withdrawn
          ? `Regalo retirado: «${data.title}»`
          : `Regalo enviado: «${data.title}»`,
        body: `${parts.join(", ")}. Total vigente: ${formatCredits(data.totalGranted)}.`,
        actionPath: `/dashboard/credits/gifts/${data.campaignId}`,
        actionLabel: "Ver el regalo",
      };
    },
  } satisfies KindDefinition<z.infer<typeof creditGiftCompletedSchema>>,

  ...reservationOutboxKinds,
  ...disciplinaryKinds,
  ...comunicadoKinds,
} as const;

export type NotificationKind = keyof typeof kinds;
export type NotificationData<K extends NotificationKind> = z.infer<
  (typeof kinds)[K]["schema"]
>;

export const NOTIFICATION_KINDS = Object.keys(kinds) as NotificationKind[];

export function isNotificationKind(value: string): value is NotificationKind {
  return Object.prototype.hasOwnProperty.call(kinds, value);
}

function definition<K extends NotificationKind>(
  kind: K,
): KindDefinition<NotificationData<K>> {
  return kinds[kind] as unknown as KindDefinition<NotificationData<K>>;
}

export function notificationCategory(kind: NotificationKind) {
  return kinds[kind].category;
}

export function hasEmail(kind: NotificationKind) {
  return "email" in kinds[kind];
}

export function buildInAppCopy<K extends NotificationKind>(
  kind: K,
  data: NotificationData<K>,
): InAppCopy {
  return definition(kind).inApp(data);
}

/**
 * The email for a stored snapshot, or null when the snapshot no longer parses
 * (or the kind has no email). A delivery that cannot render fails for good:
 * retrying the same snapshot would only fail again.
 */
export function buildEmailCopy(
  kind: string,
  payload: unknown,
): EmailCopy | null {
  if (!isNotificationKind(kind)) return null;
  const def = definition(kind);
  if (!def.email) return null;
  const parsed = def.schema.safeParse(payload);
  if (!parsed.success) return null;
  return def.email(parsed.data);
}

export function notificationCreditDelta(
  kind: string,
  data: unknown,
): number | null {
  if (!isNotificationKind(kind)) return null;
  const def = definition(kind);
  if (!def.creditDelta) return null;
  const parsed = def.schema.safeParse(data);
  return parsed.success ? def.creditDelta(parsed.data) : null;
}

/**
 * Whether tapping the item opens its own page; see `KindDefinition`. A
 * snapshot a later schema no longer reads opens the page anyway: it shows the
 * stored title, body and action, and never cuts a written message short.
 */
export function notificationOpensDetail(kind: string, data: unknown): boolean {
  if (!isNotificationKind(kind)) return false;
  const def = definition(kind);
  if (!def.opensDetail) return false;
  const parsed = def.schema.safeParse(data);
  return parsed.success ? def.opensDetail(parsed.data) : true;
}

/** Whether the item is written already read; see `KindDefinition`. */
export function notificationStartsRead<K extends NotificationKind>(
  kind: K,
  data: NotificationData<K>,
): boolean {
  return definition(kind).startsRead?.(data) ?? false;
}

/**
 * Whether this notification also goes to the person's devices; see
 * `KindDefinition.push`. An item written already read never does, and a
 * per-send kind only when its sender asked (`opts.push`).
 */
export function notificationPushes<K extends NotificationKind>(
  kind: K,
  data: NotificationData<K>,
  opts?: { push?: boolean },
): boolean {
  const def = definition(kind);
  if (def.startsRead?.(data)) return false;
  return def.push === true || (def.push === "per_send" && opts?.push === true);
}

/** Disciplinary notices, whose content stays off a lock screen. */
export function isSensitiveNotificationKind(kind: string): boolean {
  return isNotificationKind(kind) && definition(kind).sensitive === true;
}

export function parseNotificationData<K extends NotificationKind>(
  kind: K,
  data: unknown,
): NotificationData<K> | null {
  const parsed = definition(kind).schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

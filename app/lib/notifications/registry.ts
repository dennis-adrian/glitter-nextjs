import "server-only";

import type { ReactElement } from "react";
import { z } from "zod";

import {
  formatCreditCount,
  formatCredits,
} from "@/app/components/credits/credit-amount";
import CreditGiftReceivedEmail from "@/app/emails/credit-gift-received";
import CreditGiftRevokedEmail from "@/app/emails/credit-gift-revoked";
import type { NotificationCategory } from "@/app/lib/notifications/definitions";

/**
 * Every kind of notification, with its copy defined once: the inbox item and,
 * when it has one, the email. Both render from the same stored snapshot, so a
 * retry or a re-send says exactly what the first send said.
 */

const PRODUCTORA_FROM = "Productora Glitter <creditos@productoraglitter.com>";

export type InAppCopy = {
  title: string;
  body: string;
  actionPath: string | null;
  actionLabel: string | null;
};

export type EmailCopy = {
  from: string;
  subject: string;
  react: ReactElement;
};

type KindDefinition<Data> = {
  category: NotificationCategory;
  schema: z.ZodType<Data>;
  inApp: (data: Data) => InAppCopy;
  /** Absent for in-app-only kinds. */
  email?: (data: Data) => EmailCopy;
  /** Credits this moved, for the inbox's "+20". */
  creditDelta?: (data: Data) => number | null;
};

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
  granted: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
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
  } satisfies KindDefinition<z.infer<typeof creditGiftReceivedSchema>>,

  credit_gift_revoked: {
    category: "credits",
    schema: creditGiftRevokedSchema,
    inApp: (data) => ({
      title: "Ajustamos tu saldo de créditos",
      body:
        data.debtAmount > 0
          ? `Retiramos los ${formatCreditCount(data.amount)} del regalo «${data.title}». Te queda un saldo pendiente de ${formatCreditCount(data.debtAmount)}: hasta regularizarlo no vas a poder usar créditos.`
          : `Retiramos los ${formatCreditCount(data.amount)} del regalo «${data.title}».`,
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
  } satisfies KindDefinition<z.infer<typeof creditGiftRevokedSchema>>,

  /** To the admin who sent a gift, once every recipient is processed. */
  credit_gift_completed: {
    category: "admin",
    schema: creditGiftCompletedSchema,
    inApp: (data) => {
      const parts = [countLabel(data.granted, "acreditado", "acreditados")];
      if (data.skipped > 0) {
        parts.push(countLabel(data.skipped, "omitido", "omitidos"));
      }
      if (data.failed > 0) {
        parts.push(countLabel(data.failed, "con error", "con error"));
      }
      return {
        title: `Regalo enviado: «${data.title}»`,
        body: `${parts.join(", ")}. Total: ${formatCredits(data.totalGranted)}.`,
        actionPath: `/dashboard/credits/gifts/${data.campaignId}`,
        actionLabel: "Ver el regalo",
      };
    },
  } satisfies KindDefinition<z.infer<typeof creditGiftCompletedSchema>>,
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

export function parseNotificationData<K extends NotificationKind>(
  kind: K,
  data: unknown,
): NotificationData<K> | null {
  const parsed = definition(kind).schema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

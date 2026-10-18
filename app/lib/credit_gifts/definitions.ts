import { z } from "zod";

import { roundCredits } from "@/app/lib/credits/balances";
import type { creditGiftOccasionEnum } from "@/db/schema";

/**
 * Limits and copy for gifting credits (docs/PRD-in-app-notifications.md §4).
 * Client-safe: the composer validates with the same schema the action does.
 */

/** Decision 2: one click can never reach more people than this. */
export const CREDIT_GIFT_MAX_RECIPIENTS = 100;
/** Decision 3: catches 200 typed for 20. One credit is Bs 1. */
export const CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT = 500;
/** Decision 4: at or above this total the admin types the total to confirm. */
export const CREDIT_GIFT_TYPE_TO_CONFIRM_TOTAL = 1_000;

export const CREDIT_GIFT_TITLE_MAX_LENGTH = 60;
export const CREDIT_GIFT_MESSAGE_MAX_LENGTH = 300;
export const CREDIT_GIFT_INTERNAL_NOTE_MAX_LENGTH = 500;

export const CREDIT_GIFT_AMOUNT_PRESETS = [5, 10, 20, 50] as const;

/** Replaced with each recipient's name. */
export const CREDIT_GIFT_NAME_PLACEHOLDER = "{nombre}";

/** How a gift's movement reads in the participant's wallet. */
export const CREDIT_GIFT_WALLET_LABEL = "Regalo de Glitter";

export type CreditGiftOccasion =
  (typeof creditGiftOccasionEnum.enumValues)[number];

export const CREDIT_GIFT_OCCASIONS = [
  "thanks",
  "compensation",
  "prize",
  "welcome",
  "other",
] as const satisfies readonly CreditGiftOccasion[];

export const CREDIT_GIFT_OCCASION_LABELS: Record<CreditGiftOccasion, string> = {
  thanks: "Agradecimiento",
  compensation: "Compensación",
  prize: "Premio",
  welcome: "Bienvenida",
  other: "Otro",
};

/** What picking an occasion pre-fills. Every word stays editable. */
export const CREDIT_GIFT_OCCASION_TEMPLATES: Record<
  CreditGiftOccasion,
  { title: string; message: string }
> = {
  thanks: {
    title: "Un regalo para agradecerte",
    message:
      "¡Gracias por ser parte de Glitter, {nombre}! Te regalamos estos créditos para que los uses en tu próxima reserva.",
  },
  compensation: {
    title: "Créditos de compensación",
    message:
      "{nombre}, sabemos que algo no salió como esperabas. Te dejamos estos créditos en tu billetera para compensarte.",
  },
  prize: {
    title: "¡Ganaste un premio!",
    message:
      "¡Felicitaciones, {nombre}! Estos créditos son tu premio. Ya están en tu billetera.",
  },
  welcome: {
    title: "Bienvenida a Glitter",
    message:
      "¡Hola {nombre}! Te damos la bienvenida a Glitter con estos créditos para tu primera reserva.",
  },
  other: {
    title: "Te regalamos créditos",
    message:
      "¡Hola {nombre}! Te regalamos estos créditos. Ya están en tu billetera.",
  },
};

/**
 * The message as one recipient reads it. A participant with no name on file
 * reads a sentence without a gap rather than "Hola , …".
 */
export function personalizeCreditGiftMessage(
  template: string,
  name: string | null | undefined,
): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return template.split(CREDIT_GIFT_NAME_PLACEHOLDER).join(trimmed);
  }
  return (
    template
      .split(CREDIT_GIFT_NAME_PLACEHOLDER)
      .join("")
      .replace(/\s+([,.!?;:])/g, "$1")
      // "Glitter, {nombre}!" would otherwise end "Glitter,!".
      .replace(/,([.!?;:])/g, "$1")
      .replace(/([¡¿])[\s,]+/g, "$1")
      .replace(/^[,\s]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

export function creditGiftTotal(
  amountPerRecipient: number,
  recipientCount: number,
) {
  return roundCredits(amountPerRecipient * recipientCount);
}

export function requiresTypedConfirmation(total: number) {
  return total >= CREDIT_GIFT_TYPE_TO_CONFIRM_TOTAL;
}

/** Two decimals at most, the same precision the ledger stores. */
export function isValidCreditGiftAmount(amount: number) {
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= CREDIT_GIFT_MAX_AMOUNT_PER_RECIPIENT &&
    Math.abs(roundCredits(amount) - amount) < 1e-9
  );
}

const amountSchema = z.coerce
  .number()
  .refine(isValidCreditGiftAmount, "invalid_amount");

export const CreateCreditGiftSchema = z.object({
  recipientIds: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .max(CREDIT_GIFT_MAX_RECIPIENTS)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate_recipients"),
  amountPerRecipient: amountSchema,
  occasion: z.enum(CREDIT_GIFT_OCCASIONS),
  title: z.string().trim().min(1).max(CREDIT_GIFT_TITLE_MAX_LENGTH),
  message: z.string().trim().min(1).max(CREDIT_GIFT_MESSAGE_MAX_LENGTH),
  internalNote: z
    .string()
    .trim()
    .min(1)
    .max(CREDIT_GIFT_INTERNAL_NOTE_MAX_LENGTH),
  /** The total the admin typed, required at or above the threshold. */
  confirmedTotal: z.coerce.number().optional(),
  idempotencyKey: z.uuid(),
});
export type CreateCreditGiftInput = z.infer<typeof CreateCreditGiftSchema>;

/** Why someone the admin picked will not receive the gift. */
export const CREDIT_GIFT_SKIP_REASONS = {
  not_participant: "No es participante",
  not_verified: "Perfil no verificado",
  banned: "Cuenta suspendida",
  deletion_pending: "Cuenta en eliminación",
} as const;
export type CreditGiftSkipReason = keyof typeof CREDIT_GIFT_SKIP_REASONS;

/**
 * Who can open a wallet, and so can hold a gift: the statuses `/my_credits`
 * lets in. Deletion is checked separately, under the account lock.
 */
export function creditGiftSkipReason(recipient: {
  role: string;
  status: string;
}): CreditGiftSkipReason | null {
  if (recipient.role !== "user") return "not_participant";
  if (recipient.status === "banned") return "banned";
  if (recipient.status !== "verified" && recipient.status !== "paused") {
    return "not_verified";
  }
  return null;
}

/** A participant as the composer lists them. */
export type CreditGiftRecipientOption = {
  id: number;
  name: string;
  email: string;
  imageUrl: string | null;
  status: string;
  /** Why this person would be skipped, or null when they can receive it. */
  skipReason: string | null;
};

export const CREDIT_GIFT_RECIPIENT_STATUS_LABELS = {
  pending: "Procesando",
  granted: "Acreditado",
  skipped: "Omitido",
  failed: "Falló",
} as const;

export const NOT_GLOBAL_ADMIN_GIFT_REASON =
  "Solo un administrador general puede regalar créditos.";
export const CREDITS_NOT_LAUNCHED_GIFT_REASON =
  "Los participantes todavía no ven su billetera de créditos. Publicá la bandera «Créditos» antes de regalar.";

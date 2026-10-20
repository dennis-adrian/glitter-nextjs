"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { render } from "react-email";
import { z } from "zod";

import CreditGiftReceivedEmail from "@/app/emails/credit-gift-received";
import { creditGiftBlocker } from "@/app/lib/credit_gifts/access";
import {
  CREDIT_GIFT_MESSAGE_MAX_LENGTH,
  CREDIT_GIFT_TITLE_MAX_LENGTH,
  CreateCreditGiftSchema,
  isValidCreditGiftAmount,
  personalizeCreditGiftMessage,
} from "@/app/lib/credit_gifts/definitions";
import { searchCreditGiftRecipients } from "@/app/lib/credit_gifts/queries";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import {
  createCreditGift,
  processCreditGift,
  resendCreditGiftNotification,
  revokeCreditGift,
} from "@/app/lib/credit_gifts/service";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import {
  scheduleNotificationDeliveries,
  sendNotificationDeliveries,
} from "@/app/lib/notifications/deliveries";
import { consumeActionRateLimit } from "@/app/lib/rate-limit";
import {
  canMutateAdminReservations,
  canViewAdminReservationData,
} from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const GIFTS_PATH = "/dashboard/credits/gifts";

type ActionResult = { success: boolean; message: string };

export async function searchCreditGiftRecipientsAction(query: unknown) {
  if (typeof query !== "string") return [];
  return searchCreditGiftRecipients(query);
}

const previewSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  amount: z.coerce.number().refine(isValidCreditGiftAmount),
  title: z.string().trim().min(1).max(CREDIT_GIFT_TITLE_MAX_LENGTH),
  message: z.string().trim().min(1).max(CREDIT_GIFT_MESSAGE_MAX_LENGTH),
});

/** The gift email as one recipient would get it. Sends nothing. */
export async function previewCreditGiftEmailAction(
  input: unknown,
): Promise<
  | { success: true; subject: string; html: string }
  | { success: false; message: string }
> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) {
    return { success: false, message: "No autorizado." };
  }
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Completá el monto, el título y el mensaje para ver el correo.",
    };
  }
  const { name, amount, title, message } = parsed.data;
  try {
    return {
      success: true,
      subject: `Recibiste ${formatCreditCount(amount)} de regalo`,
      html: await render(
        CreditGiftReceivedEmail({
          name,
          amount,
          title,
          message: personalizeCreditGiftMessage(message, name),
        }),
      ),
    };
  } catch (error) {
    console.error("Error rendering a credit gift preview", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No se pudo generar la vista previa del correo.",
    };
  }
}

const CREATE_FAILURE_MESSAGES = {
  RECIPIENT_NOT_FOUND:
    "Alguna de las personas elegidas ya no existe. Actualizá la página y revisá la lista.",
  NO_ELIGIBLE_RECIPIENTS:
    "Ninguna de las personas elegidas puede recibir créditos.",
  CONFIRMATION_MISMATCH:
    "El total que escribiste no coincide con el del regalo.",
  // The first attempt did go through, with the details as they were then.
  IDEMPOTENCY_CONFLICT:
    "Este regalo ya se había guardado con otros datos. Revisá la lista de regalos antes de enviarlo de nuevo.",
} as const;

/**
 * Saves the gift and returns at once; crediting and mailing happen after the
 * response, and the cron finishes whatever that run leaves.
 */
export async function createCreditGiftAction(
  input: unknown,
): Promise<ActionResult & { campaignId?: number }> {
  const actor = await getCurrentUserProfile();
  const blocker = await creditGiftBlocker(actor);
  if (blocker || !actor) {
    return { success: false, message: blocker ?? "No autorizado." };
  }

  const parsed = CreateCreditGiftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Revisá los datos del regalo." };
  }

  const result = await createCreditGift(parsed.data, { id: actor.id });
  if (!result.ok) {
    return { success: false, message: CREATE_FAILURE_MESSAGES[result.code] };
  }

  const campaignId = result.campaignId;
  after(async () => {
    try {
      const processed = await processCreditGift(campaignId);
      await sendNotificationDeliveries(processed.deliveryIds, 55_000);
    } catch (error) {
      console.error("Credit gift processing failed after create", {
        campaignId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  });
  revalidatePath(GIFTS_PATH);

  return {
    success: true,
    campaignId,
    message:
      result.skippedCount > 0
        ? `Regalo guardado. Se acredita a ${result.eligibleCount} y se omite a ${result.skippedCount}.`
        : `Regalo guardado. Se acredita a ${result.eligibleCount}.`,
  };
}

const revokeSchema = z.object({
  campaignId: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
  userIds: z
    .array(z.coerce.number().int().positive().max(MAX_SERIAL_ID))
    .min(1)
    .max(100)
    .optional(),
});

export async function revokeCreditGiftAction(
  input: unknown,
): Promise<ActionResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      success: false,
      message: "Solo un administrador general puede retirar un regalo.",
    };
  }
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };

  const result = await revokeCreditGift({
    campaignId: parsed.data.campaignId,
    userIds: parsed.data.userIds,
    actorId: actor.id,
  });
  if (!result) return { success: false, message: "No encontramos el regalo." };

  scheduleNotificationDeliveries(result.deliveryIds);
  revalidatePath(`${GIFTS_PATH}/${parsed.data.campaignId}`);

  if (result.revoked === 0 && result.failed === 0 && result.cancelled === 0) {
    return {
      success: false,
      message:
        "No quedaba nadie con este regalo para retirar. Actualizá la página.",
    };
  }
  const parts: string[] = [];
  if (result.revoked > 0) {
    parts.push(
      result.revoked === 1
        ? "Retiramos el regalo a 1 persona"
        : `Retiramos el regalo a ${result.revoked} personas`,
    );
  }
  if (result.cancelled > 0) {
    // Said on its own when nobody had it yet: "Retiramos el regalo a 0
    // personas" would read as if nothing happened.
    parts.push(
      result.cancelled === 1
        ? "Dejamos de enviarlo a 1 persona que todavía no lo había recibido"
        : `Dejamos de enviarlo a ${result.cancelled} personas que todavía no lo habían recibido`,
    );
  }
  if (result.negative > 0) {
    parts.push(
      result.negative === 1
        ? "1 quedó con saldo negativo"
        : `${result.negative} quedaron con saldo negativo`,
    );
  }
  if (result.failed > 0) {
    parts.push(
      result.failed === 1
        ? "1 no se pudo retirar, intentá de nuevo"
        : `${result.failed} no se pudieron retirar, intentá de nuevo`,
    );
  }
  return { success: result.failed === 0, message: `${parts.join("; ")}.` };
}

const RESEND_FAILURE_MESSAGES = {
  NOT_GRANTED: "Solo se puede reenviar a quien todavía tiene el regalo.",
  NO_EMAIL: "Esta persona no tiene un correo registrado.",
  EMAIL_PENDING:
    "El primer correo todavía se está enviando. Esperá a que salga antes de reenviarlo.",
  SUPPRESSED:
    "Este correo está bloqueado porque rebotó o lo marcaron como spam. Desbloquealo en Correos bloqueados y volvé a intentarlo.",
} as const;

const resendSchema = z.object({
  campaignId: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
  userId: z.coerce.number().int().positive().max(MAX_SERIAL_ID),
});

/** Mails the notice again. Never credits again. */
export async function resendCreditGiftNotificationAction(
  input: unknown,
): Promise<ActionResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      success: false,
      message: "Solo un administrador general puede reenviar el aviso.",
    };
  }
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Datos inválidos." };

  const allowed = await consumeActionRateLimit({
    key: `credit-gift-resend:${parsed.data.campaignId}:${parsed.data.userId}`,
    limit: 3,
    windowMs: 10 * 60_000,
  }).catch(() => null);
  if (allowed === null) {
    return {
      success: false,
      message:
        "No pudimos reenviar el aviso. Intentá de nuevo en unos minutos.",
    };
  }
  if (!allowed) {
    return {
      success: false,
      message:
        "Ya reenviamos este aviso hace poco. Esperá unos minutos e intentá de nuevo.",
    };
  }

  const result = await resendCreditGiftNotification({
    ...parsed.data,
    actorId: actor.id,
  });
  if (!result.ok) {
    return { success: false, message: RESEND_FAILURE_MESSAGES[result.code] };
  }

  scheduleNotificationDeliveries([result.deliveryId]);
  revalidatePath(`${GIFTS_PATH}/${parsed.data.campaignId}`);
  return { success: true, message: "Reenviamos el aviso por correo." };
}

"use server";

import {
  deleteUnsubscribe,
  isSuppressed,
  isUnsubscribedFromAll,
  recipientAddress,
  resubscribe,
  unsubscribe,
} from "@/app/lib/emails/suppressions";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";
import { loggableError } from "@/app/lib/errors/loggable-error";

/**
 * The buttons on the unsubscribe page. The token from the email is the only
 * credential: whoever holds the link may change that one person's choice for
 * the topic it names, and, when the page showed them unsubscribed from all
 * bulk mail, undo that too. Nothing else.
 */

type UnsubscribeActionResult = { success: boolean; message: string };

const INVALID_LINK: UnsubscribeActionResult = {
  success: false,
  message: "Este enlace no es válido.",
};

async function resolve(token: unknown) {
  const subject = verifyUnsubscribeToken(token);
  if (!subject) return null;
  const address = await recipientAddress(subject);
  return address ? { address, topic: subject.topic } : null;
}

export async function confirmUnsubscribe(
  token: string,
): Promise<UnsubscribeActionResult> {
  try {
    const target = await resolve(token);
    if (!target) return INVALID_LINK;
    await unsubscribe(target.address, target.topic);
    return { success: true, message: "Listo, te diste de baja." };
  } catch (error) {
    console.error("Error unsubscribing", loggableError(error));
    return {
      success: false,
      message: "No pudimos darte de baja. Intenta de nuevo.",
    };
  }
}

export async function undoUnsubscribe(
  token: string,
): Promise<UnsubscribeActionResult> {
  try {
    const target = await resolve(token);
    if (!target) return INVALID_LINK;
    // The page said "todos nuestros correos masivos" when this was set, so
    // undoing it is what the person was shown and chose.
    const fromAll = await isUnsubscribedFromAll(target.address);
    if (fromAll) await deleteUnsubscribe(target.address, "all");
    await resubscribe(target.address, target.topic);
    if (await isSuppressed(target.address)) {
      return {
        success: true,
        message:
          "Quitamos tu baja, pero esta dirección está bloqueada por un rebote o un reporte de spam. Escríbenos para volver a recibir correos.",
      };
    }
    return {
      success: true,
      message: fromAll
        ? "Volverás a recibir nuestros correos."
        : "Volverás a recibir estos correos.",
    };
  } catch (error) {
    console.error("Error resubscribing", loggableError(error));
    return {
      success: false,
      message: "No pudimos guardar el cambio. Intenta de nuevo.",
    };
  }
}

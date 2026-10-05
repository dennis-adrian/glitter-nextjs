"use server";

import {
  recipientAddress,
  resubscribe,
  unsubscribe,
} from "@/app/lib/emails/suppressions";
import { verifyUnsubscribeToken } from "@/app/lib/emails/unsubscribe-tokens";

/**
 * The buttons on the unsubscribe page. The token from the email is the only
 * credential: whoever holds the link may change that one person's choice for
 * that one topic, nothing else.
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
    console.error("Error unsubscribing", error);
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
    await resubscribe(target.address, target.topic);
    return { success: true, message: "Volverás a recibir estos correos." };
  } catch (error) {
    console.error("Error resubscribing", error);
    return {
      success: false,
      message: "No pudimos guardar el cambio. Intenta de nuevo.",
    };
  }
}

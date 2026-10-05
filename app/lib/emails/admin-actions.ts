"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AddUnsubscribeSchema,
  type EmailAdminActionResult,
} from "@/app/lib/emails/admin-definitions";
import {
  deleteUnsubscribe,
  emailKey,
  liftSuppression,
  remainingOptOuts,
  unsubscribe,
} from "@/app/lib/emails/suppressions";
import {
  EMAIL_TOPICS,
  EMAIL_TOPIC_SHORT_LABELS,
} from "@/app/lib/emails/topics";
import { loggableError } from "@/app/lib/errors/loggable-error";
import { requireAdmin } from "@/app/lib/users/helpers";
import { removeResendSuppression } from "@/app/vendors/resend";
import { db } from "@/db";
import { emailSuppressions } from "@/db/schema";

/**
 * What an admin can change on the blocked-emails page. Admins only: festival
 * admins send the invitations but do not decide who gets them against their
 * own or their mail server's wishes.
 */

const PAGE_PATH = "/dashboard/emails";
const UNAUTHORIZED: EmailAdminActionResult = {
  success: false,
  message: "No autorizado",
};
const INVALID: EmailAdminActionResult = {
  success: false,
  message: "Datos inválidos",
};

/**
 * What still keeps bulk mail from `key` after a change, as a sentence for
 * the admin, or "" when nothing does.
 */
async function stillOptedOut(key: string) {
  const { suppression, topics } = await remainingOptOuts(key);
  const parts: string[] = [];
  if (suppression) {
    parts.push(
      suppression === "complaint"
        ? "sigue bloqueado por un reporte de spam"
        : "sigue bloqueado por un rebote",
    );
  }
  if (topics.length > 0) {
    parts.push(
      `sigue dado de baja de: ${topics
        .map((topic) => EMAIL_TOPIC_SHORT_LABELS[topic].toLowerCase())
        .join(", ")}`,
    );
  }
  return parts.length > 0 ? ` Ojo: ${parts.join(" y ")}.` : "";
}

const EmailKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .transform((value) => emailKey(value));

/**
 * Lets bulk mail reach a blocked address again, here and in Resend: Resend
 * keeps its own list, and an address it still blocks comes back here on the
 * next mailing.
 */
export async function unblockEmail(input: {
  emailKey: string;
}): Promise<EmailAdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return UNAUTHORIZED;
  const parsed = EmailKeySchema.safeParse(input?.emailKey);
  if (!parsed.success) return INVALID;
  const key = parsed.data;

  try {
    const [row] = await db
      .select({ reason: emailSuppressions.reason })
      .from(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.emailKey, key),
          isNull(emailSuppressions.liftedAt),
        ),
      )
      .limit(1);
    if (!row) {
      return { success: false, message: "Este correo ya no está bloqueado." };
    }

    await liftSuppression({
      address: key,
      reason: row.reason,
      eventAt: new Date(),
      liftedByUserId: admin.id,
    });
    const resend = await removeResendSuppression(key);
    revalidatePath(PAGE_PATH);
    const remaining = await stillOptedOut(key);

    switch (resend.outcome) {
      case "removed":
      case "not_listed":
        return {
          success: true,
          warning: remaining ? true : undefined,
          message: `${key} quedó desbloqueado.${remaining}`,
        };
      case "skipped":
        return {
          success: true,
          warning: remaining ? true : undefined,
          message: `${key} quedó desbloqueado. Este entorno no es producción, así que no se cambió nada en Resend.${remaining}`,
        };
      case "failed":
        console.error("Resend did not lift a suppression", {
          message: resend.message,
        });
        return {
          success: true,
          warning: true,
          message: `${key} quedó desbloqueado aquí, pero Resend no lo quitó de su lista (${resend.message}). Quítalo en Resend → Suppressions o se volverá a bloquear en el próximo envío.`,
        };
    }
  } catch (error) {
    console.error("Error unblocking an email", loggableError(error));
    return {
      success: false,
      message: "No se pudo desbloquear. Intenta de nuevo.",
    };
  }
}

/**
 * Unsubscribes someone who asked by other means (a reply, a message to
 * support): from one kind of bulk mail or from all of it, now and later.
 */
export async function addUnsubscribe(
  input: unknown,
): Promise<EmailAdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return UNAUTHORIZED;
  const parsed = AddUnsubscribeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? INVALID.message,
    };
  }
  const { email, topic } = parsed.data;

  try {
    await unsubscribe(email, topic, admin.id);
    revalidatePath(PAGE_PATH);
    return {
      success: true,
      message: `${emailKey(email)} quedó dado de baja: ${EMAIL_TOPIC_SHORT_LABELS[topic].toLowerCase()}.`,
    };
  } catch (error) {
    console.error("Error adding an unsubscribe", loggableError(error));
    return {
      success: false,
      message: "No se pudo dar de baja. Intenta de nuevo.",
    };
  }
}

/**
 * Takes back one unsubscribe, for someone who asked to receive that mail
 * again, or one added by mistake.
 */
export async function removeUnsubscribe(input: {
  emailKey: string;
  topic: string;
}): Promise<EmailAdminActionResult> {
  const admin = await requireAdmin();
  if (!admin) return UNAUTHORIZED;
  const key = EmailKeySchema.safeParse(input?.emailKey);
  const topic = z.enum(EMAIL_TOPICS).safeParse(input?.topic);
  if (!key.success || !topic.success) return INVALID;

  try {
    const removed = await deleteUnsubscribe(key.data, topic.data);
    revalidatePath(PAGE_PATH);
    if (removed === 0) {
      return { success: false, message: "Esa baja ya no existe." };
    }
    console.info("Admin removed an unsubscribe", {
      adminId: admin.id,
      topic: topic.data,
    });
    const remaining = await stillOptedOut(key.data);
    return {
      success: true,
      warning: remaining ? true : undefined,
      message: `Quitamos la baja de ${key.data}: ${EMAIL_TOPIC_SHORT_LABELS[topic.data].toLowerCase()}.${remaining}`,
    };
  } catch (error) {
    console.error("Error removing an unsubscribe", loggableError(error));
    return {
      success: false,
      message: "No se pudo quitar la baja. Intenta de nuevo.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { scheduleNotificationDeliveries } from "@/app/lib/notifications/deliveries";
import { MAX_SERIAL_ID } from "@/app/lib/notifications/definitions";
import { NOTIFICATION_RESEND_REFUSALS } from "@/app/lib/notifications/admin-resend-definitions";
import { resendFailedNotificationEmail } from "@/app/lib/notifications/admin-resend";
import { requireAdmin } from "@/app/lib/users/helpers";
import {
  isImpersonationReadOnlyError,
  refuseDuringView,
} from "@/db/write-guard";

const LOG_PATH = "/dashboard/notifications";

export type ResendFailedEmailActionResult = {
  success: boolean;
  message: string;
};

const ResendFailedEmailSchema = z.object({
  deliveryId: z.number().int().positive().max(MAX_SERIAL_ID),
});

const RESEND_FAILED = "No pudimos reenviar el correo. Probá de nuevo.";

/**
 * "Reenviar correo" on a failed row of the notification log. Admins only.
 * During a view as someone else nothing is written or sent: the email goes
 * out after the answer, where the guard no longer sees the view, so it is
 * refused here first.
 */
export async function resendFailedNotificationEmailAction(
  input: unknown,
): Promise<ResendFailedEmailActionResult> {
  try {
    await refuseDuringView();
  } catch (error) {
    if (isImpersonationReadOnlyError(error)) {
      return { success: false, message: (error as Error).message };
    }
    throw error;
  }
  const admin = await requireAdmin();
  if (!admin) return { success: false, message: "No autorizado." };

  const parsed = ResendFailedEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: NOTIFICATION_RESEND_REFUSALS.NOT_FOUND };
  }

  let outcome: Awaited<ReturnType<typeof resendFailedNotificationEmail>>;
  try {
    outcome = await resendFailedNotificationEmail({
      deliveryId: parsed.data.deliveryId,
      by: admin.id,
    });
  } catch (error) {
    if (isImpersonationReadOnlyError(error)) {
      return { success: false, message: (error as Error).message };
    }
    // The type only: a driver message can echo the address.
    console.error("[notifications] admin resend failed", {
      deliveryId: parsed.data.deliveryId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { success: false, message: RESEND_FAILED };
  }
  if (!outcome.ok) {
    return {
      success: false,
      message: NOTIFICATION_RESEND_REFUSALS[outcome.code],
    };
  }

  scheduleNotificationDeliveries([outcome.deliveryId]);
  revalidatePath(LOG_PATH);
  return {
    success: true,
    message: "Lo estamos reenviando. El reenvío aparece arriba en la lista.",
  };
}

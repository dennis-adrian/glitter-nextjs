"use server";

import { count, eq, exists, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import {
  festivalCategories,
  invitableParticipant,
} from "@/app/lib/festivals/participant-audience";
import type {
  ActivationNotificationAudienceResult,
  ActivationNotificationPreviewResult,
  ActivationNotificationSendResult,
} from "@/app/lib/festivals/invitation-definitions";
import { sendFestivalBulkPushes } from "@/app/lib/notifications/festival-bulk-pushes";
import type { FestivalParticipantInvitationData } from "@/app/lib/notifications/kinds/festival-invitation";
import { notifyMany } from "@/app/lib/notifications/notify";
import { buildPushPayload } from "@/app/lib/notifications/push/payload";
import { buildInAppCopy } from "@/app/lib/notifications/registry";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { festivals, pushSubscriptions, users } from "@/db/schema";

/**
 * The activation invitation in Glitter: an inbox item for every participant
 * the email is for, and — when the admin ticks it — a push to their devices.
 * It goes out from "Activar festival" next to the email.
 *
 * Unlike the email, nobody is left out for a bounced address or an email
 * unsubscribe: the inbox is not mail. A push only reaches devices whose
 * owner turned avisos on.
 */

const KIND = "festival_participant_invitation" as const;

/** Time the send leaves its own pushes after answering; the cron has the rest. */
const PUSH_DRAIN_BUDGET_MS = 60_000;

const FestivalIdSchema = z.number().int().positive();
const SendInputSchema = z.object({
  festivalId: FestivalIdSchema,
  push: z.boolean(),
});

/** One per person per festival: activating again never repeats it. */
function dedupeKey(festivalId: number) {
  return `festival-participant-invitation:${festivalId}`;
}

async function loadFestival(festivalId: number) {
  const [festival] = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      status: festivals.status,
      reservationsStartDate: festivals.reservationsStartDate,
    })
    .from(festivals)
    .where(eq(festivals.id, festivalId));
  return festival ?? null;
}

function invitationData(
  festival: NonNullable<Awaited<ReturnType<typeof loadFestival>>>,
  now: Date,
): FestivalParticipantInvitationData {
  return {
    festivalId: festival.id,
    festivalName: festival.name,
    reservationsStartDate: festival.reservationsStartDate.toISOString(),
    reservationsOpen:
      festival.reservationsStartDate.getTime() <= now.getTime(),
  };
}

const hasDevice = exists(
  db
    .select({ one: sql`1` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, users.id)),
);

/**
 * How many participants the notice would reach, and how many of them have a
 * device that takes pushes. Counts only.
 */
export async function fetchActivationNotificationAudience(
  festivalId: number,
): Promise<ActivationNotificationAudienceResult> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, message: "No autorizado" };
  if (!FestivalIdSchema.safeParse(festivalId).success) {
    return { success: false, message: "Solicitud inválida" };
  }

  try {
    const categories = await festivalCategories(festivalId);
    if (categories.length === 0) {
      return { success: true, audience: { recipients: 0, withPush: 0 } };
    }
    const [row] = await db
      .select({
        recipients: count(),
        withPush: sql<number>`count(*) filter (where ${hasDevice})`.mapWith(
          Number,
        ),
      })
      .from(users)
      .where(invitableParticipant(categories));
    return {
      success: true,
      audience: {
        recipients: row?.recipients ?? 0,
        withPush: row?.withPush ?? 0,
      },
    };
  } catch (error) {
    console.error("Error counting activation notification audience", error);
    return {
      success: false,
      message: "No se pudo calcular a quiénes se enviará la notificación.",
    };
  }
}

/**
 * The inbox item and the push as a participant would get them, rendered
 * from the festival as it is now. Sends nothing.
 */
export async function previewActivationNotification(
  festivalId: number,
): Promise<ActivationNotificationPreviewResult> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, message: "No autorizado" };
  if (!FestivalIdSchema.safeParse(festivalId).success) {
    return { success: false, message: "Solicitud inválida" };
  }

  try {
    const festival = await loadFestival(festivalId);
    if (!festival) {
      return { success: false, message: "Festival no encontrado" };
    }
    const copy = buildInAppCopy(KIND, invitationData(festival, new Date()));
    const push = JSON.parse(
      buildPushPayload({
        id: 0,
        title: copy.title,
        body: copy.body,
        sensitive: false,
        writtenText: false,
        href: copy.actionPath ?? "/my_notifications",
      }),
    ) as { title: string; body: string };
    return {
      success: true,
      item: copy,
      push: { title: push.title, body: push.body },
    };
  } catch (error) {
    console.error("Error rendering an activation notification preview", error);
    return {
      success: false,
      message: "No se pudo generar la vista previa de la notificación.",
    };
  }
}

/**
 * Writes the notice for every participant the activation reaches, in one
 * transaction, and starts its pushes once that commits. Whom it reaches is
 * read here, never taken from the caller. Someone who already has it for this
 * festival is skipped, so a second click or a re-activation sends nothing
 * new.
 */
export async function sendActivationNotifications(
  input: z.input<typeof SendInputSchema>,
): Promise<ActivationNotificationSendResult> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return { success: false, message: "No autorizado" };
  const parsed = SendInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Solicitud inválida" };
  }
  const { festivalId, push } = parsed.data;

  try {
    const festival = await loadFestival(festivalId);
    if (!festival) {
      return { success: false, message: "Festival no encontrado" };
    }
    // Its button opens the terms page, which only works while it is active.
    if (festival.status !== "active") {
      return {
        success: false,
        message: "Activa el festival antes de enviar notificaciones.",
      };
    }

    const categories = await festivalCategories(festivalId);
    const recipients =
      categories.length === 0
        ? []
        : await db
            .select({ id: users.id })
            .from(users)
            .where(invitableParticipant(categories));
    const userIds = recipients.map((row) => row.id);

    const result = await db.transaction((tx) =>
      notifyMany(tx, {
        kind: KIND,
        data: invitationData(festival, new Date()),
        userIds,
        dedupeKey: dedupeKey(festivalId),
        push,
      }),
    );

    if (result.pushDeliveryIds.length > 0) {
      after(async () => {
        try {
          await sendFestivalBulkPushes({ budgetMs: PUSH_DRAIN_BUDGET_MS });
        } catch (error) {
          // What is left is the notifications cron's.
          console.error("Activation push drain failed", {
            festivalId,
            errorType: error instanceof Error ? error.name : typeof error,
          });
        }
      });
    }

    return {
      success: true,
      notified: result.createdUserIds.length,
      alreadyNotified: userIds.length - result.createdUserIds.length,
      pushes: result.pushDeliveryIds.length,
    };
  } catch (error) {
    console.error("Error sending activation notifications", error);
    return {
      success: false,
      message: "No se pudieron enviar las notificaciones. Inténtalo nuevamente.",
    };
  }
}

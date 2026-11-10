import "server-only";

import { inArray } from "drizzle-orm";

import { sendBulkPushes } from "@/app/lib/notifications/deliveries";
import { notifications } from "@/db/schema";

/**
 * Festival notices written with `notifyMany`, whose pushes sit in the bulk
 * lane. The transactional push pass skips that lane and the comunicado
 * driver only takes its own campaigns, so these are drained here: right
 * after a send, and by the notifications cron for whatever that missed.
 */
export const FESTIVAL_BULK_PUSH_KINDS = [
  "festival_participant_invitation",
  "festival_reservations_open",
  "festival_stands_available",
] as const;

export function sendFestivalBulkPushes({ budgetMs }: { budgetMs: number }) {
  return sendBulkPushes({
    scope: inArray(notifications.kind, [...FESTIVAL_BULK_PUSH_KINDS]),
    budgetMs,
  });
}

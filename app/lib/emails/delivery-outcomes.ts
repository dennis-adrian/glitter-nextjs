import "server-only";

import { and, eq, type SQL, sql } from "drizzle-orm";

import type { DeliveryEvent } from "@/app/lib/emails/resend-webhook";
import { db } from "@/db";
import { notificationDeliveries } from "@/db/schema";

/**
 * Records what Resend reported about an email on its row in
 * `notification_deliveries`, found by Resend's email id
 * (`provider_message_id`). That covers the delivery queue, the bulk lane
 * (each batch row keeps its own id) and emails recorded by
 * `sendRecordedEmail`. The reservation and disciplinary outboxes keep no
 * Resend id and are not updated.
 *
 * Webhooks repeat, arrive out of order and name emails we have no row for:
 *
 * - an unknown id updates nothing, and is not an error;
 * - the stronger outcome wins whatever order they arrive in: a delay, then a
 *   soft bounce, then delivered, then a hard bounce, failed or suppressed
 *   (all final), then a spam complaint, which can follow a delivery and
 *   outranks everything. A soft bounce (`Transient`/`Temporary`, or
 *   `Undetermined`) ranks below delivered: Resend's guide says it may be an
 *   autoresponder, so it never undoes a reported delivery, while a hard
 *   bounce after one (an asynchronous rejection) does;
 * - between two outcomes of the same rank, the newer event (Resend's
 *   `created_at`, which retries keep) wins, so a repeat changes nothing.
 *
 * `status`, our own send state, is never touched.
 */

const DETAIL_MAX_LENGTH = 500;

function rank(outcome: SQL, bounceType: SQL) {
  return sql`(CASE
    WHEN ${outcome} = 'delivery_delayed' THEN 1
    WHEN ${outcome} = 'bounced'
      AND lower(coalesce(${bounceType}, '')) <> 'permanent' THEN 2
    WHEN ${outcome} = 'delivered' THEN 3
    WHEN ${outcome} IN ('bounced', 'failed', 'suppressed') THEN 4
    WHEN ${outcome} = 'complained' THEN 5
    ELSE 0
  END)`;
}

/** Rows changed: 0 for an unknown email, a repeat, or a weaker event. */
export async function recordDeliveryEvent(event: DeliveryEvent) {
  const d = notificationDeliveries;
  const eventAt = event.eventAt ?? new Date();
  const byEmail = and(
    eq(d.providerMessageId, event.emailId),
    eq(d.channel, "email"),
  );

  if (event.kind === "engagement") {
    // The first open or click: an earlier one arriving late moves it back.
    const column = event.engagement === "opened" ? d.openedAt : d.clickedAt;
    const updated = await db
      .update(d)
      .set(
        event.engagement === "opened"
          ? { openedAt: eventAt, updatedAt: sql`now()` }
          : { clickedAt: eventAt, updatedAt: sql`now()` },
      )
      .where(
        and(
          byEmail,
          sql`(${column} IS NULL OR ${column} > ${eventAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
        ),
      )
      .returning({ id: d.id });
    return updated.length;
  }

  const incoming = sql`${event.outcome}::email_delivery_outcome`;
  const incomingRank = rank(incoming, sql`${event.bounceType}::text`);
  const currentRank = rank(sql`${d.deliveryOutcome}`, sql`${d.bounceType}`);
  const at = sql`(${eventAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const updated = await db
    .update(d)
    .set({
      deliveryOutcome: event.outcome,
      deliveryOutcomeAt: eventAt,
      bounceType: event.outcome === "bounced" ? event.bounceType : null,
      deliveryDetail: event.detail?.slice(0, DETAIL_MAX_LENGTH) ?? null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        byEmail,
        sql`(
          ${d.deliveryOutcome} IS NULL
          OR ${incomingRank} > ${currentRank}
          OR (
            ${incomingRank} = ${currentRank}
            AND ${at} > coalesce(${d.deliveryOutcomeAt}, '-infinity'::timestamp)
          )
        )`,
      ),
    )
    .returning({ id: d.id });
  return updated.length;
}

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
 * - the stronger outcome wins whatever order they arrive in: a delay, then
 *   delivered, then bounced, failed or suppressed (all final), then a spam
 *   complaint, which can follow a delivery and outranks everything;
 * - between two outcomes of the same rank, the newer event (Resend's
 *   `created_at`, which retries keep) wins, so a repeat changes nothing.
 *
 * `status`, our own send state, is never touched.
 */

const DETAIL_MAX_LENGTH = 500;

function rank(outcome: SQL) {
  return sql`(CASE ${outcome}
    WHEN 'delivery_delayed' THEN 1
    WHEN 'delivered' THEN 2
    WHEN 'bounced' THEN 3
    WHEN 'failed' THEN 3
    WHEN 'suppressed' THEN 3
    WHEN 'complained' THEN 4
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
          OR ${rank(incoming)} > ${rank(sql`${d.deliveryOutcome}`)}
          OR (
            ${rank(incoming)} = ${rank(sql`${d.deliveryOutcome}`)}
            AND ${at} > coalesce(${d.deliveryOutcomeAt}, '-infinity'::timestamp)
          )
        )`,
      ),
    )
    .returning({ id: d.id });
  return updated.length;
}

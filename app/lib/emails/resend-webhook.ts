import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { SuppressionReason } from "@/app/lib/emails/suppressions";

/**
 * Resend signs its webhooks the Svix way: HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${raw body}`, keyed with the base64 secret
 * after its `whsec_` prefix, sent as space-separated `v1,<base64>` entries
 * (two of them while a secret is being rotated). Written before the SDK had a
 * helper; `resend.webhooks.verify` in 6.x checks the same signature.
 */

/** How far a signed timestamp may be from our clock, as Svix allows. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  /** Epoch milliseconds; tests pass it. */
  now?: number;
}): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(timestamp)) return false;

  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${input.payload}`)
    .digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const presented = Buffer.from(value, "base64");
    return (
      presented.length === expected.length &&
      timingSafeEqual(presented, expected)
    );
  });
}

export type SuppressionChange =
  | {
      action: "suppress";
      address: string;
      reason: SuppressionReason;
      resendEmailId: string | null;
      detail: string | null;
      /** When Resend created the event; null if it did not say. */
      eventAt: Date | null;
    }
  | {
      action: "lift";
      address: string;
      reason: SuppressionReason;
      eventAt: Date | null;
    };

type Data = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recipients(data: Data) {
  const to = Array.isArray(data.to) ? data.to : [data.to];
  return to.map(text).filter((address): address is string => !!address);
}

/**
 * When Resend created the event: the envelope's `created_at`, which stays the
 * same across retries and replays, unlike the delivery's svix-timestamp.
 */
function eventTime(event: Data, data: Data) {
  for (const value of [event.created_at, data.created_at]) {
    if (typeof value !== "string") continue;
    const time = new Date(value);
    if (!Number.isNaN(time.getTime())) return time;
  }
  return null;
}

function joined(...parts: unknown[]) {
  const present = parts.map(text).filter(Boolean);
  return present.length > 0 ? present.join(": ") : null;
}

/**
 * What a Resend event means for who bulk mail must skip. Only permanent
 * failures count: a full mailbox or a greylisting server arrives as a
 * transient bounce or a delay, and the next mailing should try again.
 * Unknown events and shapes mean nothing, rather than an error, so Resend
 * does not retry them for a day.
 */
export function suppressionChanges(event: unknown): SuppressionChange[] {
  if (!event || typeof event !== "object") return [];
  const { type, data } = event as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !data || typeof data !== "object") return [];
  const payload = data as Data;
  const resendEmailId = text(payload.email_id);
  const eventAt = eventTime(event as Data, payload);

  const suppress = (
    addresses: string[],
    reason: SuppressionReason,
    detail: string | null,
  ): SuppressionChange[] =>
    addresses.map((address) => ({
      action: "suppress",
      address,
      reason,
      resendEmailId,
      detail,
      eventAt,
    }));

  switch (type) {
    case "email.bounced": {
      const bounce = (payload.bounce ?? {}) as Data;
      if (bounce.type !== "Permanent") return [];
      return suppress(
        recipients(payload),
        "bounce",
        joined(bounce.subType, bounce.message),
      );
    }
    case "email.complained":
      return suppress(recipients(payload), "complaint", null);
    case "email.suppressed": {
      // Resend refused to send because of its own list: mirror it, so the
      // next mailing skips the address instead of spending quota on it.
      const suppressed = (payload.suppressed ?? {}) as Data;
      return suppress(
        recipients(payload),
        suppressed.reason === "previous_complaint" ? "complaint" : "bounce",
        joined(suppressed.reason, suppressed.message),
      );
    }
    case "suppression.added": {
      const address = text(payload.email);
      if (!address) return [];
      return [
        {
          action: "suppress",
          address,
          reason: payload.origin === "complaint" ? "complaint" : "bounce",
          resendEmailId: text(payload.source_id),
          detail: joined("Resend", payload.origin),
          eventAt,
        },
      ];
    }
    case "suppression.removed": {
      const address = text(payload.email);
      if (!address) return [];
      return [
        {
          action: "lift",
          address,
          reason: payload.origin === "complaint" ? "complaint" : "bounce",
          eventAt,
        },
      ];
    }
    default:
      return [];
  }
}

export type DeliveryOutcome =
  | "delivery_delayed"
  | "delivered"
  | "bounced"
  | "failed"
  | "suppressed"
  | "complained";

/** What one Resend `email.*` event says about the email it names. */
export type DeliveryEvent =
  | {
      kind: "outcome";
      emailId: string;
      outcome: DeliveryOutcome;
      /** A bounce's type: `Permanent`, `Transient` or `Undetermined`. */
      bounceType: string | null;
      detail: string | null;
      eventAt: Date | null;
    }
  | {
      kind: "engagement";
      emailId: string;
      engagement: "opened" | "clicked";
      eventAt: Date | null;
    };

const OUTCOME_EVENTS: Record<string, DeliveryOutcome> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

/**
 * What a Resend event means for the delivery row of the email it names
 * (`data.email_id`, the id the send returned). Null for every other event,
 * and for a shape this does not recognise: nothing to record, not an error.
 *
 * `email.sent` adds nothing to our own `sent`; opens and clicks are kept
 * only as first times, and Resend reports them only with tracking on.
 */
export function deliveryEvent(event: unknown): DeliveryEvent | null {
  if (!event || typeof event !== "object") return null;
  const { type, data } = event as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !data || typeof data !== "object") {
    return null;
  }
  const payload = data as Data;
  const emailId = text(payload.email_id);
  if (!emailId) return null;
  const eventAt = eventTime(event as Data, payload);

  if (type === "email.opened" || type === "email.clicked") {
    return {
      kind: "engagement",
      emailId,
      engagement: type === "email.opened" ? "opened" : "clicked",
      eventAt,
    };
  }

  const outcome = OUTCOME_EVENTS[type];
  if (!outcome) return null;
  let bounceType: string | null = null;
  let detail: string | null = null;
  if (outcome === "bounced") {
    const bounce = (payload.bounce ?? {}) as Data;
    bounceType = text(bounce.type);
    detail = joined(bounce.subType, bounce.message);
  } else if (outcome === "failed") {
    detail = joined((payload.failed as Data | undefined)?.reason);
  } else if (outcome === "suppressed") {
    const suppressed = (payload.suppressed ?? {}) as Data;
    // The SDK types say `type`; the suppression rules above read `reason`.
    detail = joined(suppressed.type ?? suppressed.reason, suppressed.message);
  }
  return { kind: "outcome", emailId, outcome, bounceType, detail, eventAt };
}

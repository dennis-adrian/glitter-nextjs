import {
  suppressionChanges,
  verifyResendWebhook,
} from "@/app/lib/emails/resend-webhook";
import {
  recordSuppression,
  removeSuppression,
} from "@/app/lib/emails/suppressions";
import { serverEnv } from "@/env";

/** Far more than any Resend event; refuses a flood before hashing it. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Resend's webhook: hard bounces, spam complaints and Resend's own
 * suppressions become entries that bulk mailings skip.
 *
 * Any 2xx acknowledges an event; anything else makes Resend retry it for
 * about a day, so a database error answers 500. Deliveries can repeat and
 * arrive out of order, which `recordSuppression` tolerates.
 */
export async function POST(request: Request) {
  const secret = serverEnv.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET is not set; refusing Resend webhook");
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  const payload = await request.text();
  if (payload.length > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  const verified = verifyResendWebhook({
    payload,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    secret,
  });
  if (!verified) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    for (const change of suppressionChanges(event)) {
      if (change.action === "suppress") {
        await recordSuppression(change);
      } else {
        await removeSuppression(change.address);
      }
    }
  } catch (error) {
    console.error("Error applying Resend webhook", {
      type: (event as { type?: unknown })?.type,
      error,
    });
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}

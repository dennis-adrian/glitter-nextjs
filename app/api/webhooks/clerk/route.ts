import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import { loggableError } from "@/app/lib/errors/loggable-error";
import { recordClerkLoginDeleted } from "@/app/lib/users/clerk-login-deleted";
import { serverEnv } from "@/env";

/** Far more than any Clerk event; refuses a flood before verifying it. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Clerk's webhook. Only `user.deleted` is acted on: a login deleted without
 * the app deleting its profile is recorded against that profile, so it is
 * never left looking like an ordinary account nobody can sign in to (see
 * `recordClerkLoginDeleted`).
 *
 * Signed the Svix way, checked by Clerk's own `verifyWebhook`. Any 2xx
 * acknowledges an event; anything else makes Clerk retry it, so a database
 * error answers 500. Deliveries can repeat, which the recording tolerates.
 */
export async function POST(request: NextRequest) {
  const signingSecret = serverEnv.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error(
      "CLERK_WEBHOOK_SIGNING_SECRET is not set; refusing Clerk webhook",
    );
    return Response.json({ error: "not_configured" }, { status: 500 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (event.type !== "user.deleted") {
    return Response.json({ received: true, ignored: event.type });
  }
  const clerkId = event.data.id;
  if (!clerkId) return Response.json({ received: true });

  try {
    const result = await recordClerkLoginDeleted(clerkId);
    if (result.kind === "flagged") {
      // For an operator: the profile stays, its login does not, and no cron
      // will finish it (kept by the app, or an admin's deletion under way).
      console.error("Clerk login deleted outside a deletion the app finishes", {
        profileId: result.profileId,
      });
    }
  } catch (error) {
    console.error("Error applying Clerk user.deleted webhook", {
      error: loggableError(error),
    });
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}

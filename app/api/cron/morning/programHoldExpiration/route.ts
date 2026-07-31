import { timingSafeEqual } from "crypto";

import {
  expireAbandonedHolds,
  expireWaitlistInvitations,
} from "@/app/lib/programs/scheduled-actions";

function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed when the secret is unset.
  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const token = authorization.slice("Bearer ".length);
  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(cronSecret);
  if (tokenBuffer.length !== secretBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenBuffer, secretBuffer);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    // Only the count is returned. The ids identify real purchases and the
    // response reaches whoever holds the secret, so there is no reason to
    // hand them out — they are already in the audit trail.
    // Both lapse on their own clocks and neither depends on the other, so one
    // run covers the two rather than paying for a second scheduled request.
    const [holds, invitations] = await Promise.all([
      expireAbandonedHolds(),
      expireWaitlistInvitations(),
    ]);

    return new Response(
      JSON.stringify({
        data: {
          expired: holds.expired,
          expiredInvitations: invitations.expired,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error expiring abandoned program holds", error);
    return new Response(
      JSON.stringify({ error: "Error expiring abandoned program holds" }),
      { status: 500 },
    );
  }
}

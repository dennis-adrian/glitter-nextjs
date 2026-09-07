import { timingSafeEqual } from "crypto";

import { processPendingStorageCleanupJobs } from "@/app/lib/uploadthing/actions";

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
    const result = await processPendingStorageCleanupJobs();
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error processing storage cleanup jobs", error);
    return new Response(
      JSON.stringify({ error: "Error processing storage cleanup jobs" }),
      { status: 500 },
    );
  }
}

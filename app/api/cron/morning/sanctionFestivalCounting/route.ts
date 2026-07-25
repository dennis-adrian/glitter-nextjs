import { timingSafeEqual } from "crypto";

import { processPendingDisciplinaryNotificationJobs } from "@/app/lib/infractions/notifications";
import { reconcileSanctionFestivalCounting } from "@/app/lib/sanctions/festival-counting";

function isAuthorizedCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
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
    const reconciliation = await reconcileSanctionFestivalCounting();
    const notifications = await processPendingDisciplinaryNotificationJobs();
    return new Response(
      JSON.stringify({ data: { reconciliation, notifications } }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error reconciling sanction festival counting", error);
    return new Response(
      JSON.stringify({
        error: "Error reconciling sanction festival counting",
      }),
      { status: 500 },
    );
  }
}

import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { sendDueReservationsOpenNotices } from "@/app/lib/festivals/reservations-open-notices";

/** Leaves room under the 100-second limit for one last slow request. */
const RUN_BUDGET_MS = 75_000;

/**
 * Every five minutes: the "reservations are open" notice for each active
 * festival whose reservations just opened, once per opening time. Each is
 * delivered as far as the run allows; the comunicados cron sends the rest of
 * its email and the notifications cron the rest of its pushes.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const result = await sendDueReservationsOpenNotices({
      deadline: Date.now() + RUN_BUDGET_MS,
    });
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error sending reservations-open notices", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return new Response(
      JSON.stringify({ error: "Error sending reservations-open notices" }),
      { status: 500 },
    );
  }
}

import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { processPendingReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const result = await processPendingReservationNotificationJobs();
    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error processing reservation notification jobs", error);
    return new Response(
      JSON.stringify({
        error: "Error processing reservation notification jobs",
      }),
      { status: 500 },
    );
  }
}

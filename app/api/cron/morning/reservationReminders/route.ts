import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { handleReservationReminderEmails } from "@/app/lib/profile_tasks/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const pendingReservationTasks = await handleReservationReminderEmails();

    // A count only: the tasks carry profile and reservation rows.
    return new Response(
      JSON.stringify({
        data: {
          remindersSent: pendingReservationTasks.length,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error sending reservation reminders", error);
    return new Response(
      JSON.stringify({
        error: "Error sending reservation reminders",
      }),
      { status: 500 },
    );
  }
}

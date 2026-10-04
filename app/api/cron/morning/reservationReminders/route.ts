import { handleReservationReminderEmails } from "@/app/lib/profile_tasks/actions";

// No CRON_SECRET check yet: an external scheduler calls this route, and
// nothing shows it sends the bearer header. Gating it would silently stop the
// job. It only runs work that is already due, and answers with a count.
export async function GET() {
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

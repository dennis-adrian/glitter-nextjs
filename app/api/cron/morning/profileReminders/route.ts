import { handleReminderEmails } from "@/app/lib/profile_tasks/actions";

// No CRON_SECRET check yet: an external scheduler calls this route, and
// nothing shows it sends the bearer header. Gating it would silently stop the
// job. It only runs work that is already due, and answers with a count.
export async function GET() {
  try {
    const pendingProfileTasks = await handleReminderEmails();

    // A count only: the tasks carry each reminded profile's full row.
    return new Response(
      JSON.stringify({
        data: {
          remindersSent: pendingProfileTasks.length,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error handling incomplete profiles", error);
    return new Response(
      JSON.stringify({
        error: "Error handling incomplete profiles",
      }),
      { status: 500 },
    );
  }
}

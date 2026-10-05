import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { handleReminderEmails } from "@/app/lib/profile_tasks/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

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

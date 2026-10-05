import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { handleDeletionEmails } from "@/app/lib/profile_tasks/actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const profileDeletionTasks = await handleDeletionEmails();

    // A count only: the tasks carry the deleted profiles' full rows.
    return new Response(
      JSON.stringify({
        data: {
          profilesDeleted: profileDeletionTasks.length,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error handling profile deletion", error);
    return new Response(
      JSON.stringify({
        error: "Error handling profile deletion",
      }),
      { status: 500 },
    );
  }
}

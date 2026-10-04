import { handleDeletionEmails } from "@/app/lib/profile_tasks/actions";

// No CRON_SECRET check yet: an external scheduler calls this route, and
// nothing shows it sends the bearer header. Gating it would silently stop the
// job. It only runs work that is already due, and answers with a count.
export async function GET() {
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

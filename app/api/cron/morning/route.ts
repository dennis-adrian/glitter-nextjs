import {
  sendDeletionEmails,
  handleReminderEmails,
} from "@/app/lib/profile_tasks/actions";

export async function GET(req: Request) {
  const pendingTasks = await handleReminderEmails();
  const overdueTasks = await sendDeletionEmails();

  return new Response(
    JSON.stringify({
      data: {
        remindersSent: pendingTasks,
        deletedProfiles: overdueTasks,
      },
    }),
    { status: 200 },
  );
}

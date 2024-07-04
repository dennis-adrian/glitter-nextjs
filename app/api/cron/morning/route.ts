import {
  handleDeletionEmails,
  handleReminderEmails,
} from "@/app/lib/profile_tasks/actions";

export async function GET(req: Request) {
  const pendingTasks = await handleReminderEmails();
  const overdueTasks = await handleDeletionEmails();

  return new Response(
    JSON.stringify({
      data: {
        remindersTasks: pendingTasks,
        deletionTasks: overdueTasks,
      },
    }),
    { status: 200 },
  );
}

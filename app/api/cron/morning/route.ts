import {
  sendDeletionEmails,
  sendReminderEmails,
} from "@/app/lib/profile_tasks/actions";

export async function GET(req: Request) {
  const pendingTasks = await sendReminderEmails();
  const overdueTasks = await sendDeletionEmails();

  return new Response(
    JSON.stringify({
      data: {
        pending: pendingTasks,
        overdue: overdueTasks,
      },
    }),
    { status: 200 },
  );
}

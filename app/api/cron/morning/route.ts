import {
  handleDeletionEmails,
  handleReminderEmails,
  handleReservationReminderEmails,
} from "@/app/lib/profile_tasks/actions";

export async function GET(req: Request) {
  const pendingTasks = await handleReminderEmails();
  const overdueTasks = await handleDeletionEmails();
  const pendingReservationTasks = await handleReservationReminderEmails();

  return new Response(
    JSON.stringify({
      data: {
        remindersTasks: pendingTasks,
        deletionTasks: overdueTasks,
        pendingReservationTasks: pendingReservationTasks,
      },
    }),
    { status: 200 },
  );
}

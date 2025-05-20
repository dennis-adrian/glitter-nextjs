import { handleReservationReminderEmails } from "@/app/lib/profile_tasks/actions";

export async function GET(req: Request) {
	try {
		const pendingReservationTasks = await handleReservationReminderEmails();

		return new Response(
			JSON.stringify({
				data: {
					pendingReservationTasks,
				},
			}),
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

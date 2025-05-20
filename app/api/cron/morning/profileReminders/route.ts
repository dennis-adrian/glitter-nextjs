import { handleReminderEmails } from "@/app/lib/profile_tasks/actions";

export async function GET() {
	try {
		const pendingProfileTasks = await handleReminderEmails();

		return new Response(
			JSON.stringify({
				data: {
					pendingProfileTasks,
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

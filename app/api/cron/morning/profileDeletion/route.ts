import { handleDeletionEmails } from "@/app/lib/profile_tasks/actions";

export async function GET() {
	try {
		const profileDeletionTasks = await handleDeletionEmails();

		return new Response(
			JSON.stringify({
				data: {
					profileDeletionTasks,
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

import { processExpiredWaitlistNotifications } from "@/app/lib/festival_activites/scheduled-actions";

export async function GET() {
	try {
		const result = await processExpiredWaitlistNotifications();

		return new Response(JSON.stringify({ data: result }), { status: 200 });
	} catch (error) {
		console.error("Error processing expired waitlist notifications", error);
		return new Response(
			JSON.stringify({
				error: "Error processing expired waitlist notifications",
			}),
			{ status: 500 },
		);
	}
}

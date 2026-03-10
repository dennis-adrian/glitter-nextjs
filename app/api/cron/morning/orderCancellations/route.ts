import { handleOrderCancellations } from "@/app/lib/orders/scheduled-actions";

export async function GET() {
	try {
		const cancelledCount = await handleOrderCancellations();

		return new Response(
			JSON.stringify({
				data: { cancelledCount },
			}),
			{ status: 200 },
		);
	} catch (error) {
		console.error("Error cancelling overdue orders", error);
		return new Response(
			JSON.stringify({
				error: "Error cancelling overdue orders",
			}),
			{ status: 500 },
		);
	}
}

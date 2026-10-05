import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { handleOrderPaymentReminders } from "@/app/lib/orders/scheduled-actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const counts = await handleOrderPaymentReminders();

    return new Response(
      JSON.stringify({
        data: counts,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error sending order payment reminders", error);
    return new Response(
      JSON.stringify({
        error: "Error sending order payment reminders",
      }),
      { status: 500 },
    );
  }
}

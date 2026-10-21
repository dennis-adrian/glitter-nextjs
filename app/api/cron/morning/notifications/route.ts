import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { resumeProcessingCreditGifts } from "@/app/lib/credit_gifts/service";
import { processPendingNotificationDeliveries } from "@/app/lib/notifications/deliveries";

/**
 * Every five minutes: finishes any credit gift a request left half done, then
 * sends the email deliveries that are due. Gifts go first because they create
 * deliveries of their own.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const gifts = await resumeProcessingCreditGifts({ budgetMs: 25_000 });
    const deliveries = await processPendingNotificationDeliveries({
      budgetMs: 55_000,
    });
    return new Response(
      JSON.stringify({
        data: {
          gifts: { gifts: gifts.gifts, granted: gifts.granted },
          deliveries,
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error processing notifications", error);
    return new Response(
      JSON.stringify({ error: "Error processing notifications" }),
      { status: 500 },
    );
  }
}

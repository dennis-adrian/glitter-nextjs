import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { resumeProcessingCreditGifts } from "@/app/lib/credit_gifts/service";
import {
  processPendingNotificationDeliveries,
  sendDuePushDeliveries,
} from "@/app/lib/notifications/deliveries";

/** Leaves room under the 100-second limit for one last slow request. */
const RUN_BUDGET_MS = 75_000;

/**
 * Every five minutes: finishes any credit gift a request left half done, then
 * sends the deliveries that are due. Gifts go first because they create
 * deliveries of their own; pushes go before email because they are quick and
 * not spaced, so a long email queue never holds an alert back.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    // One deadline for all three passes, checked before each send: the last
    // request of a pass can still take its full timeout (10 s), and the
    // function is stopped at 100 s.
    const startedAt = Date.now();
    const budget = (own: number) =>
      Math.max(0, Math.min(own, RUN_BUDGET_MS - (Date.now() - startedAt)));
    const gifts = await resumeProcessingCreditGifts({
      budgetMs: budget(25_000),
    });
    const pushes = await sendDuePushDeliveries({
      limit: 100,
      budgetMs: budget(10_000),
    });
    const deliveries = await processPendingNotificationDeliveries({
      budgetMs: budget(50_000),
    });
    return new Response(
      JSON.stringify({
        data: {
          gifts: { gifts: gifts.gifts, granted: gifts.granted },
          pushes,
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

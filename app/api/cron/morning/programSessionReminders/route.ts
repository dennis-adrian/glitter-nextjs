import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { sendSessionDayReminders } from "@/app/lib/programs/scheduled-actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    // Counts only. The response reaches whoever holds the secret, and the
    // recipients are attendees — their addresses have no business in it.
    const result = await sendSessionDayReminders();

    return new Response(JSON.stringify({ data: result }), { status: 200 });
  } catch (error) {
    console.error("Error sending program session day reminders", error);
    return new Response(
      JSON.stringify({ error: "Error sending program session day reminders" }),
      { status: 500 },
    );
  }
}

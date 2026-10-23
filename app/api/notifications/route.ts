import {
  NOTIFICATION_POPOVER_SIZE,
  parseNotificationFilter,
} from "@/app/lib/notifications/definitions";
import {
  fetchInboxPage,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";

/**
 * The bell's list. A route handler rather than a server action: it is a read,
 * fetched when the popover opens, and actions queue behind each other.
 */
export async function GET(request: Request) {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? NOTIFICATION_POPOVER_SIZE);
  try {
    const page = await fetchInboxPage(viewer, {
      filter: parseNotificationFilter(params.get("filter"), viewer.role),
      unreadOnly: params.get("unread") === "1",
      before: params.get("before"),
      limit: Number.isFinite(limit) ? limit : NOTIFICATION_POPOVER_SIZE,
    });
    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load notifications", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

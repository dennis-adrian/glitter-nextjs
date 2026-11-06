import {
  fetchUnreadNotificationCount,
  resolveInboxViewerWithAccess,
} from "@/app/lib/notifications/queries";

/** Polled by the bell every minute while the tab is visible. */
export async function GET() {
  const viewer = await resolveInboxViewerWithAccess();
  if (!viewer) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const count = await fetchUnreadNotificationCount(viewer);
    return Response.json(
      { count },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to count unread notifications", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

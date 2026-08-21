import { after, NextRequest } from "next/server";

import { fetchOrdersForAdmin } from "@/app/lib/orders/actions";
import {
  parseStoreOrdersQuery,
  storeOrdersQueryToSearchParams,
} from "@/app/lib/orders/query-schema";
import {
  serializeOrderLineItemsCsv,
  serializeOrdersSummaryCsv,
} from "@/app/lib/orders/csv";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { captureServerEvent } from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

type ExportFormat = "summary" | "line_items";

function contentDisposition(filename: string) {
  return `attachment; filename="${filename}"`;
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return new Response("No autorizado", { status: 401 });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const query = parseStoreOrdersQuery(raw);
  const requestedFormat = request.nextUrl.searchParams.get("format");
  const format: ExportFormat =
    requestedFormat === "line_items" ? "line_items" : "summary";
  const orders = await fetchOrdersForAdmin(query);
  const csv =
    format === "line_items"
      ? serializeOrderLineItemsCsv(orders)
      : serializeOrdersSummaryCsv(orders);
  const today = new Date().toISOString().slice(0, 10);
  const filename =
    format === "line_items"
      ? `articulos-vendidos-${today}.csv`
      : `pedidos-${today}.csv`;

  // Keep only non-sensitive filter categories in the diagnostic header.
  const canonicalQuery = storeOrdersQueryToSearchParams({
    ...query,
    q: "",
  }).toString();
  after(() =>
    captureServerEvent({
      distinctId: profile.clerkId,
      event: POSTHOG_EVENTS.STORE_ORDERS_EXPORTED,
      context: "store orders export",
      properties: {
        format,
        status: query.status,
        status_count: query.statuses
          ? query.statuses.split(",").filter(Boolean).length
          : query.status === "all"
            ? 0
            : 1,
        rental: query.rental,
        period: query.period,
        has_search: Boolean(query.q),
        row_count: orders.length,
      },
    }),
  );
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(filename),
      "X-Store-Orders-Filter": canonicalQuery,
      "Cache-Control": "private, no-store",
    },
  });
}

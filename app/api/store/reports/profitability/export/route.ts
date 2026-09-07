import { DateTime } from "luxon";
import { after, NextRequest } from "next/server";

import { fetchOrdersProfitability } from "@/app/lib/orders/actions";
import { serializeProfitabilityCsv } from "@/app/lib/orders/csv";
import {
  getProfitabilityDateRange,
  parseProfitabilityQuery,
  profitabilityQueryToSearchParams,
} from "@/app/lib/orders/profitability-query-schema";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { getStoreCategoryFilenameSuffix } from "@/app/lib/store/category";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { captureServerEvent } from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return new Response("No autorizado", { status: 401 });
  }

  const query = parseProfitabilityQuery(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const report = await fetchOrdersProfitability({
    ...getProfitabilityDateRange(query),
    category: query.category,
  });
  const csv = serializeProfitabilityCsv(report.rows);
  const today = DateTime.now().setZone(STORE_TIMEZONE).toISODate();
  const categorySuffix = getStoreCategoryFilenameSuffix(query.category);
  const coverage =
    report.grossRevenue === 0
      ? 0
      : (report.knownCostRevenue / report.grossRevenue) * 100;
  after(() =>
    captureServerEvent({
      distinctId: profile.clerkId,
      event: POSTHOG_EVENTS.STORE_PROFITABILITY_EXPORTED,
      context: "store profitability export",
      properties: {
        period: query.period,
        category: query.category,
        has_custom_range: Boolean(query.from || query.to),
        row_count: report.rows.length,
        coverage_band:
          coverage >= 100 ? "complete" : coverage >= 75 ? "high" : "low",
      },
    }),
  );

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentabilidad-${categorySuffix}-${today}.csv"`,
      "X-Store-Profitability-Filter":
        profitabilityQueryToSearchParams(query).toString(),
      "Cache-Control": "private, no-store",
    },
  });
}

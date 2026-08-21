import { NextRequest } from "next/server";

import { fetchOrdersProfitability } from "@/app/lib/orders/actions";
import { serializeProfitabilityCsv } from "@/app/lib/orders/csv";
import {
  getProfitabilityDateRange,
  parseProfitabilityQuery,
  profitabilityQueryToSearchParams,
} from "@/app/lib/orders/profitability-query-schema";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return new Response("No autorizado", { status: 401 });
  }

  const query = parseProfitabilityQuery(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const report = await fetchOrdersProfitability(
    getProfitabilityDateRange(query),
  );
  const csv = serializeProfitabilityCsv(report.rows);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentabilidad-${today}.csv"`,
      "X-Store-Profitability-Filter":
        profitabilityQueryToSearchParams(query).toString(),
      "Cache-Control": "private, no-store",
    },
  });
}

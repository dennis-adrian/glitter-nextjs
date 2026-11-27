import { DateTime } from "luxon";
import { z } from "zod";

import { serializeFinanceRowsCsv } from "@/app/lib/festivals/finance/csv";
import { fetchFestivalFinance } from "@/app/lib/festivals/finance/queries";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { requireAdmin } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/** The per-reservation rows behind the finance page's totals, as CSV. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return new Response("No autorizado", { status: 401 });
  }
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return new Response("No encontrado", { status: 404 });

  const finance = await fetchFestivalFinance(parsed.data.id);
  if (!finance) return new Response("No encontrado", { status: 404 });

  const today = DateTime.now().setZone(STORE_TIMEZONE).toISODate();
  const filename = `finanzas-festival-${finance.festival.id}-${today}.csv`;
  return new Response(`﻿${serializeFinanceRowsCsv(finance.rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

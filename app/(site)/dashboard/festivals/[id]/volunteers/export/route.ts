import { z } from "zod";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { POSTGRES_INT_MAX } from "@/app/lib/volunteers/admin-definitions";
import {
  serializeVolunteerExportCsv,
  volunteerExportFilename,
} from "@/app/lib/volunteers/admin-export";
import { fetchVolunteerApplicationsForExport } from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

/**
 * The festival's volunteer applications as CSV ("Exportar CSV" on the list).
 * Strangers' personal data: admins and festival admins only, never cached,
 * and the rows are never logged.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminOrFestivalAdmin())) {
    return new Response("No autorizado", { status: 401 });
  }
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return new Response("No encontrado", { status: 404 });

  const data = await fetchVolunteerApplicationsForExport(parsed.data.id);
  if (!data) return new Response("No encontrado", { status: 404 });

  const now = new Date();
  const filename = volunteerExportFilename(data.festival, now);
  // The BOM makes Excel read the file as UTF-8.
  return new Response(`﻿${serializeVolunteerExportCsv(data, now)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

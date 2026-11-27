import { z } from "zod";

import { buildView, resolveRules } from "@/app/lib/credentials/calculate";
import {
  parseCredentialFilters,
  POSTGRES_INT_MAX,
} from "@/app/lib/credentials/definitions";
import {
  credentialsExportFilename,
  serializeCredentialsCsv,
} from "@/app/lib/credentials/export";
import { fetchCredentialsData } from "@/app/lib/credentials/queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

/**
 * The festival's credentials as CSV ("Exportar CSV"), under the same status
 * and group filters as the page (`?estados=`, `?grupos=`). Built through
 * `buildView`, like the page, so the two cannot disagree. People's names:
 * admins and festival admins only, never cached.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminOrFestivalAdmin())) {
    return new Response("No autorizado", { status: 401 });
  }
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return new Response("No encontrado", { status: 404 });

  const data = await fetchCredentialsData(db, parsed.data.id);
  if (!data) return new Response("No encontrado", { status: 404 });

  const search = new URL(request.url).searchParams;
  const filters = parseCredentialFilters({
    estados: search.get("estados") ?? undefined,
    grupos: search.get("grupos") ?? undefined,
  });
  const view = buildView(data, resolveRules(data.ruleRows), filters);
  const filename = credentialsExportFilename(data.festival);
  // The BOM makes Excel read the file as UTF-8.
  return new Response(`﻿${serializeCredentialsCsv(view.holders)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

import type { NextRequest } from "next/server";

import { listLibraryIconsWithSvg } from "@/app/lib/links/icon-library";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/**
 * A page of the dashboard picker: every Lucide and Simple Icons icon, or the
 * ones a search finds, each with its drawing so the picker asks once per
 * page and not once per icon. For the staff who manage the links page, like
 * the actions that save one.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin" && profile?.role !== "festival_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const offset = Number(params.get("offset") ?? 0);
  return Response.json(
    await listLibraryIconsWithSvg(params.get("q") ?? "", offset),
  );
}

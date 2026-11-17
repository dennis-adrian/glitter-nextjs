import type { NextRequest } from "next/server";

import {
  ICON_LIBRARY_SIZE,
  searchLibraryIcons,
} from "@/app/lib/links/icon-library";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/**
 * The dashboard picker's search over every Lucide and Simple Icons icon.
 * For the staff who manage the links page, like the actions that save one.
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin" && profile?.role !== "festival_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json({
    icons: searchLibraryIcons(query),
    total: ICON_LIBRARY_SIZE,
  });
}

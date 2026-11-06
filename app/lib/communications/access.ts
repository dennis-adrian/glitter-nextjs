import "server-only";

import { notFound } from "next/navigation";

import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { requireAdmin } from "@/app/lib/users/helpers";

/**
 * The gate every Comunicaciones page passes (docs/IMPLEMENTATION-comunicados.md
 * G2): global admins only, with the `comunicados` flag visible to them. The
 * dashboard layout admits festival admins, so each page asks for itself; to
 * anyone else the area is a 404.
 */
export async function requireCommunicationsAdmin() {
  const viewer = await requireAdmin();
  if (!viewer) notFound();
  await requireFeatureEnabled("comunicados", viewer);
  return viewer;
}

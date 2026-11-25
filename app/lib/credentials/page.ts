import "server-only";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { POSTGRES_INT_MAX } from "@/app/lib/credentials/definitions";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

const festivalIdSchema = z.coerce.number().int().positive().max(POSTGRES_INT_MAX);

/**
 * The credentials page's gate: an admin or festival admin, the
 * `festival_credentials` flag on for them, and a well-formed festival id.
 * Whether the festival exists is the data read's to say (it returns null).
 */
export async function loadCredentialsPage(rawFestivalId: string) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/");
  await requireFeatureEnabled("festival_credentials", profile);
  const parsed = festivalIdSchema.safeParse(rawFestivalId);
  if (!parsed.success) notFound();
  return { profile, festivalId: parsed.data };
}

import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { POSTGRES_INT_MAX } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerTaskCall } from "@/app/lib/volunteers/admin-task-queries";

const pageId = z.coerce.number().int().positive().max(POSTGRES_INT_MAX);

/** A route id, or a 404. */
export function parsePageId(raw: string | undefined) {
  const parsed = pageId.safeParse(raw);
  if (!parsed.success) notFound();
  return parsed.data;
}

/**
 * Every page of the admin by task: an admin or festival admin, a festival
 * that exists, and its call with the counts the screens show. Once per
 * request: Revisar's layout and its pages both ask.
 */
export const loadVolunteerTaskPage = cache(async function loadVolunteerTaskPage(
  rawFestivalId: string,
) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");
  const festivalId = parsePageId(rawFestivalId);
  const call = await fetchVolunteerTaskCall(festivalId);
  if (!call) notFound();
  return { festivalId, call };
});

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import VolunteerSetupView from "@/app/components/volunteers/admin/volunteer-setup-view";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { POSTGRES_INT_MAX } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerAdminCall } from "@/app/lib/volunteers/admin-queries";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

export const metadata: Metadata = { title: "Roles, turnos y fechas" };

/**
 * The volunteer call's setup: when it closes and when the induction is, the
 * shifts people mark and the roles they choose from.
 */
export default async function VolunteerSetupPage(props: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();

  const call = await fetchVolunteerAdminCall(parsed.data.id);
  if (!call) notFound();

  return <VolunteerSetupView call={call} />;
}

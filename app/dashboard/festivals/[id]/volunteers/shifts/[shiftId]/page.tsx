import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerShiftDetailView, {
  volunteerCoverageHref,
} from "@/app/components/volunteers/admin/volunteer-shift-detail-view";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { POSTGRES_INT_MAX } from "@/app/lib/volunteers/admin-definitions";
import { fetchVolunteerShiftDetail } from "@/app/lib/volunteers/admin-queries";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
  shiftId: z.coerce.number().int().positive().max(POSTGRES_INT_MAX),
});

export const metadata: Metadata = { title: "Turno" };

/**
 * One volunteer shift: how full it is, who is assigned to it, and who marked
 * it and could still cover it, with "Asignar" and "Quitar" on each.
 */
export default async function VolunteerShiftPage(props: {
  params: Promise<{ id: string; shiftId: string }>;
}) {
  if (!(await requireAdminOrFestivalAdmin())) redirect("/");

  const parsed = ParamsSchema.safeParse(await props.params);
  if (!parsed.success) notFound();
  const { id: festivalId, shiftId } = parsed.data;

  const detail = await fetchVolunteerShiftDetail(festivalId, shiftId);
  if (!detail) notFound();

  return (
    <>
      <ScreenTitle
        title={formatShiftWhen(detail.shift)}
        backHref={volunteerCoverageHref(festivalId)}
      />
      <VolunteerShiftDetailView detail={detail} />
    </>
  );
}

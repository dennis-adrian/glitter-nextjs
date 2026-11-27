import type { Metadata } from "next";

import VolunteerShiftAssignScreen from "@/app/components/volunteers/admin/tasks/shift-assign-screen";
import { fetchVolunteerShiftDetail } from "@/app/lib/volunteers/admin-queries";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  shiftsByNeed,
  volunteerAssignPath,
  volunteerReviewHref,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Asignar voluntarios" };

/**
 * Asignar, by shift: the layout shows the shifts missing the most people
 * first; from lg the first of them is open beside the list.
 */
export default async function VolunteerAssignPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  if (!call.settings) return null;
  const first = shiftsByNeed(call.shifts)[0];
  if (!first) return null;
  const detail = await fetchVolunteerShiftDetail(festivalId, first.id);
  if (!detail) return null;

  return (
    <VolunteerShiftAssignScreen
      // A refresh can put another shift first: its picks start empty.
      key={first.id}
      festivalId={festivalId}
      detail={detail}
      roles={call.roles}
      backHref={volunteerAssignPath(festivalId)}
      reviewHref={volunteerReviewHref(festivalId, "antiguas")}
    />
  );
}

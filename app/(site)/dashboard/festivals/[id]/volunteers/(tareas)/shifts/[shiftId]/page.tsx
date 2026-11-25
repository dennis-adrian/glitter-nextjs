import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ScreenTitle } from "@/app/components/navbar/screen-bar";
import VolunteerShiftAssignScreen from "@/app/components/volunteers/admin/tasks/shift-assign-screen";
import { AssignByShiftPane } from "@/app/components/volunteers/admin/tasks/task-layouts";
import { fetchVolunteerShiftDetail } from "@/app/lib/volunteers/admin-queries";
import {
  loadVolunteerTaskPage,
  parsePageId,
} from "@/app/lib/volunteers/admin-task-page";
import {
  volunteerAssignPath,
  volunteerReviewHref,
} from "@/app/lib/volunteers/admin-tasks";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

export const metadata: Metadata = { title: "Turno" };

/**
 * One shift, to add people to it: who is assigned and the accepted people
 * who marked it. Below the tasks' header, beside the Asignar list from lg.
 */
export default async function VolunteerShiftPage(props: {
  params: Promise<{ id: string; shiftId: string }>;
}) {
  const params = await props.params;
  const { festivalId, call } = await loadVolunteerTaskPage(params.id);
  const shiftId = parsePageId(params.shiftId);
  const shift = call.shifts.find((candidate) => candidate.id === shiftId);
  const detail = shift
    ? await fetchVolunteerShiftDetail(festivalId, shiftId)
    : null;
  if (!shift || !detail) notFound();
  const backHref = volunteerAssignPath(festivalId);

  return (
    <>
      <ScreenTitle title={formatShiftWhen(detail.shift)} backHref={backHref} />
      <AssignByShiftPane
        call={call}
        selectedId={shiftId}
        listOnPhone={false}
        detail={
          <VolunteerShiftAssignScreen
            festivalId={festivalId}
            detail={detail}
            roles={call.roles}
            backHref={backHref}
            reviewHref={volunteerReviewHref(festivalId, "antiguas")}
          />
        }
      />
    </>
  );
}

import type { Metadata } from "next";

import VolunteerShiftAssignScreen from "@/app/components/volunteers/admin/tasks/shift-assign-screen";
import {
  AssignByShiftLayout,
  NoCallState,
  pageFrame,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import VolunteerTaskHeader from "@/app/components/volunteers/admin/tasks/task-header";
import { fetchVolunteerShiftDetail } from "@/app/lib/volunteers/admin-queries";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  shiftsByNeed,
  volunteerAssignPath,
  volunteerReviewHref,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Asignar voluntarios" };

/**
 * Asignar, by shift: the shifts missing the most people first. From lg the
 * first of them is open beside the list.
 */
export default async function VolunteerAssignPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  if (!call.settings) {
    return (
      <div className={pageFrame}>
        <VolunteerTaskHeader call={call} task="asignar" />
        <NoCallState festivalId={festivalId} />
      </div>
    );
  }
  const first = shiftsByNeed(call.shifts)[0];
  const detail = first
    ? await fetchVolunteerShiftDetail(festivalId, first.id)
    : null;

  return (
    <AssignByShiftLayout
      call={call}
      selectedId={first?.id}
      listOnPhone
      detail={
        first &&
        detail && (
          <VolunteerShiftAssignScreen
            festivalId={festivalId}
            detail={detail}
            roles={call.roles}
            backHref={volunteerAssignPath(festivalId)}
            reviewHref={volunteerReviewHref(festivalId, "antiguas")}
          />
        )
      }
    />
  );
}

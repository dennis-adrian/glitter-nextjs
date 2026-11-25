import type { ReactNode } from "react";

import { AssignByShiftPane } from "@/app/components/volunteers/admin/tasks/assign-pane";
import {
  AssignStrip,
  NoCallState,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import { VolunteerTaskSummary } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import {
  remainingPlaces,
  shiftsByNeed,
} from "@/app/lib/volunteers/admin-tasks";

/**
 * Asignar by shift, below the tasks' header: the shift list, kept across the
 * shifts opened from it, so picking one only loads that shift (`children`).
 */
export default async function VolunteerAssignByShiftLayout(props: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  const summary = (
    <VolunteerTaskSummary
      task="asignar"
      pending={call.statusTotals.pending}
      places={remainingPlaces(call.shifts).places}
      strip={call.settings ? <AssignStrip call={call} /> : null}
    />
  );
  if (!call.settings) {
    return (
      <>
        {summary}
        <NoCallState festivalId={festivalId} />
      </>
    );
  }

  return (
    <>
      {summary}
      <AssignByShiftPane
        festivalId={festivalId}
        shifts={call.shifts}
        roles={call.roles}
        withoutShifts={call.acceptedWithoutShifts}
        firstId={shiftsByNeed(call.shifts)[0]?.id}
      >
        {props.children}
      </AssignByShiftPane>
    </>
  );
}

import type { ReactNode } from "react";

import { VolunteerHeaderTop } from "@/app/components/volunteers/admin/tasks/task-header";
import {
  AssignStrip,
  ReviewStrip,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import { VolunteerTaskFrame } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import { remainingPlaces } from "@/app/lib/volunteers/admin-tasks";

/**
 * Revisar and Asignar: the header both share ("Voluntarios", settings,
 * export, the task switch), kept across both tasks and every screen in them,
 * so switching tasks or opening an item loads only the content below it.
 */
export default async function VolunteerTasksLayout(props: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );

  return (
    <VolunteerTaskFrame
      festivalId={festivalId}
      top={<VolunteerHeaderTop call={call} />}
      pending={call.statusTotals.pending}
      places={remainingPlaces(call.shifts).places}
      strips={{
        revisar: <ReviewStrip call={call} />,
        // Before the call exists Asignar has nothing to count.
        asignar: call.settings ? <AssignStrip call={call} /> : null,
      }}
    >
      {props.children}
    </VolunteerTaskFrame>
  );
}

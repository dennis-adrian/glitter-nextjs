import type { Metadata } from "next";

import { AssignModeNav } from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import VolunteerPeopleList from "@/app/components/volunteers/admin/tasks/people-list";
import VolunteerTaskHeader from "@/app/components/volunteers/admin/tasks/task-header";
import {
  AssignStrip,
  NoCallState,
  pageFrame,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import { fetchAcceptedPeoplePage } from "@/app/lib/volunteers/admin-task-queries";
import { VOLUNTEER_LIST_BATCH } from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Asignar por persona" };

/** Asignar, by person: accepted people, those without shifts first. */
export default async function VolunteerPeoplePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  const items = call.settings
    ? await fetchAcceptedPeoplePage(festivalId, [], VOLUNTEER_LIST_BATCH)
    : [];

  return (
    <div className={pageFrame}>
      <VolunteerTaskHeader
        call={call}
        task="asignar"
        strip={<AssignStrip call={call} />}
      />
      {!call.settings ? (
        <NoCallState festivalId={festivalId} />
      ) : (
        <div className="flex w-full max-w-2xl min-w-0 flex-col gap-3.5">
          <AssignModeNav
            festivalId={festivalId}
            mode="persona"
            withoutShifts={call.acceptedWithoutShifts}
          />
          <VolunteerPeopleList
            festivalId={festivalId}
            items={items}
            total={call.statusTotals.accepted}
            shifts={call.shifts}
          />
        </div>
      )}
    </div>
  );
}

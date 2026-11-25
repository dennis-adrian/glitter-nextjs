import type { Metadata } from "next";

import { AssignModeNav } from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import VolunteerPeopleList from "@/app/components/volunteers/admin/tasks/people-list";
import {
  AssignStrip,
  NoCallState,
} from "@/app/components/volunteers/admin/tasks/task-layouts";
import { VolunteerTaskSummary } from "@/app/components/volunteers/admin/tasks/volunteer-task-frame";
import { loadVolunteerTaskPage } from "@/app/lib/volunteers/admin-task-page";
import { fetchAcceptedPeoplePage } from "@/app/lib/volunteers/admin-task-queries";
import {
  remainingPlaces,
  VOLUNTEER_LIST_BATCH,
} from "@/app/lib/volunteers/admin-tasks";

export const metadata: Metadata = { title: "Asignar por persona" };

/**
 * Asignar, by person, below the tasks' header: accepted people, those
 * without shifts first.
 */
export default async function VolunteerPeoplePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { festivalId, call } = await loadVolunteerTaskPage(
    (await props.params).id,
  );
  const items = call.settings
    ? await fetchAcceptedPeoplePage(festivalId, [], VOLUNTEER_LIST_BATCH)
    : [];

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
    <div className="flex w-full max-w-2xl min-w-0 flex-col gap-3.5">
      {summary}
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
  );
}

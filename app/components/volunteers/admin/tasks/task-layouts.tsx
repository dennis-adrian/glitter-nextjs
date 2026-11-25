import Link from "next/link";
import type { ReactNode } from "react";

import { buttonVariants } from "@/app/components/ui/button";
import { Strong } from "@/app/components/volunteers/admin/tasks/application-sections";
import AssignShiftList, {
  AssignModeNav,
} from "@/app/components/volunteers/admin/tasks/assign-shift-list";
import VolunteerTaskHeader, {
  VolunteerStrip,
} from "@/app/components/volunteers/admin/tasks/task-header";
import { cn } from "@/app/lib/utils";
import { pageFrame } from "@/app/components/volunteers/admin/tasks/task-frame";
import { volunteerSetupAdminPath } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerTaskCall } from "@/app/lib/volunteers/admin-task-queries";
import { plural, remainingPlaces } from "@/app/lib/volunteers/admin-tasks";

/**
 * The frames of the admin by task: Revisar's pieces (its frame, which keeps
 * the list beside the open application, is `ReviewFrame`) and Asignar by shift (shift list beside the open
 * shift). Server components; the screens inside are client ones.
 */

export { pageFrame };
export {
  VolunteerReviewDetailSkeleton,
  VolunteerTaskSkeleton,
} from "@/app/components/volunteers/admin/tasks/task-skeletons";

/** "Quedan 24 lugares por cubrir y ya hay 12 personas aceptadas." */
export function ReviewStrip({ call }: { call: VolunteerTaskCall }) {
  const { places } = remainingPlaces(call.shifts);
  const accepted = call.statusTotals.accepted;
  return (
    <VolunteerStrip>
      Quedan <Strong>{plural(places, "lugar", "lugares")}</Strong> por cubrir y
      ya hay{" "}
      <Strong>
        {plural(accepted, "persona aceptada", "personas aceptadas")}
      </Strong>
      .
    </VolunteerStrip>
  );
}

/** "Quedan 24 lugares por cubrir en 5 turnos." (+ who lacks shifts, desktop) */
export function AssignStrip({ call }: { call: VolunteerTaskCall }) {
  const { places, shifts } = remainingPlaces(call.shifts);
  const without = call.acceptedWithoutShifts;
  return (
    <VolunteerStrip>
      Quedan <Strong>{plural(places, "lugar", "lugares")}</Strong> por cubrir en{" "}
      {plural(shifts, "turno", "turnos")}.
      {without > 0 && (
        <span className="hidden lg:inline">
          {" "}
          <Strong>
            {plural(without, "persona aceptada", "personas aceptadas")}
          </Strong>{" "}
          todavía no {without === 1 ? "tiene" : "tienen"} turnos.
        </span>
      )}
    </VolunteerStrip>
  );
}

/** Before the call is configured: one way forward, to the setup. */
export function NoCallState({ festivalId }: { festivalId: number }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
      <h2 className="font-semibold">Todavía no hay convocatoria</h2>
      <Link
        href={volunteerSetupAdminPath(festivalId)}
        className={buttonVariants({
          wrap: true,
          className: "min-h-11 md:min-h-10",
        })}
      >
        Configurá la convocatoria
      </Link>
    </div>
  );
}

/**
 * Asignar by shift: header, "Por turno | Por persona", the shift list and,
 * from lg, `detail` beside it. `listOnPhone` false shows only `detail` on
 * phones.
 */
export function AssignByShiftLayout({
  call,
  selectedId,
  detail,
  listOnPhone,
}: {
  call: VolunteerTaskCall;
  selectedId?: number;
  detail: ReactNode;
  listOnPhone: boolean;
}) {
  const festivalId = call.festival.id;
  return (
    <div className={cn(pageFrame, !listOnPhone && "max-lg:p-0 max-lg:pb-0")}>
      <VolunteerTaskHeader
        call={call}
        task="asignar"
        strip={<AssignStrip call={call} />}
        className={cn(!listOnPhone && "max-lg:hidden")}
      />
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
        <aside
          className={cn(
            "flex min-w-0 flex-col gap-3.5 lg:w-95 lg:shrink-0 lg:gap-4",
            !listOnPhone && "max-lg:hidden",
          )}
        >
          <AssignModeNav
            festivalId={festivalId}
            mode="turno"
            withoutShifts={call.acceptedWithoutShifts}
          />
          <AssignShiftList
            festivalId={festivalId}
            shifts={call.shifts}
            roles={call.roles}
            selectedId={selectedId}
          />
        </aside>
        {detail && (
          <div className={cn("min-w-0 flex-1", listOnPhone && "max-lg:hidden")}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

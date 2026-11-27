import Link from "next/link";

import { buttonVariants } from "@/app/components/ui/button";
import { Strong } from "@/app/components/volunteers/admin/tasks/application-sections";
import { VolunteerStrip } from "@/app/components/volunteers/admin/tasks/task-header";
import { pageFrame } from "@/app/components/volunteers/admin/tasks/task-frame";
import { volunteerSetupAdminPath } from "@/app/lib/volunteers/admin-definitions";
import type { VolunteerTaskCall } from "@/app/lib/volunteers/admin-task-queries";
import { plural, remainingPlaces } from "@/app/lib/volunteers/admin-tasks";

/**
 * The pieces of the admin by task below its header (the header and the frame
 * are `VolunteerTaskFrame`, the lists `ReviewPane` and `AssignByShiftPane`):
 * the strips, the empty state and the skeletons.
 */

export { pageFrame };
export {
  VolunteerReviewDetailSkeleton,
  VolunteerTaskBodySkeleton,
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

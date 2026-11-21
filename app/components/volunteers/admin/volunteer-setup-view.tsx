import Link from "next/link";

import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import VolunteerCallSettingsForm from "@/app/components/volunteers/admin/volunteer-call-settings-form";
import VolunteerRoleTable from "@/app/components/volunteers/admin/volunteer-role-table";
import VolunteerShiftTable from "@/app/components/volunteers/admin/volunteer-shift-table";
import type { VolunteerAdminCall } from "@/app/lib/volunteers/admin-definitions";
import { VOLUNTEERS_PATH } from "@/app/lib/volunteers/definitions";

/**
 * /dashboard/festivals/[id]/volunteers/setup, from plain data: the call's
 * dates, its shifts and its roles, each card saving on its own.
 */
export default function VolunteerSetupView({
  call,
  editingShift,
  editingRole,
}: {
  call: Pick<VolunteerAdminCall, "festival" | "settings" | "roles" | "shifts">;
  /** Opens a shift's (or a new one's) editor at first; stories use it. */
  editingShift?: number | "new";
  /** Opens a role's (or a new one's) editor at first; stories use it. */
  editingRole?: number | "new";
}) {
  const festivalId = call.festival.id;

  return (
    <div className="container flex min-w-0 flex-col gap-4 p-3 pb-10 md:p-6">
      <PageBreadcrumbs
        labels={{ [`/dashboard/festivals/${festivalId}`]: call.festival.name }}
      />

      <div className="min-w-0">
        <h1 className="text-2xl font-bold md:text-3xl" data-installed-title="">
          Roles, turnos y fechas
        </h1>
        <p className="mt-1 break-words text-muted-foreground">
          Lo que cambies acá se ve al instante en la página pública{" "}
          <Link
            href={VOLUNTEERS_PATH}
            target="_blank"
            rel="noopener"
            className="text-primary underline underline-offset-2"
          >
            {VOLUNTEERS_PATH}
          </Link>{" "}
          de {call.festival.name}.
        </p>
      </div>

      <VolunteerCallSettingsForm
        festivalId={festivalId}
        settings={call.settings}
      />
      <VolunteerShiftTable
        festivalId={festivalId}
        shifts={call.shifts}
        initialEditing={editingShift}
      />
      <VolunteerRoleTable
        festivalId={festivalId}
        roles={call.roles}
        initialEditing={editingRole}
      />
    </div>
  );
}

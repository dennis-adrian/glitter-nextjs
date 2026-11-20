import VolunteerRoleForm from "@/app/components/volunteers/admin/volunteer-role-form";
import VolunteerRoleRow from "@/app/components/volunteers/admin/volunteer-role-row";
import type { VolunteerAdminRole } from "@/app/lib/volunteers/admin-definitions";

/** The call's roles, each editable in place, and the form to add one. */
export default function VolunteerRoleList({
  festivalId,
  roles,
}: {
  festivalId: number;
  roles: VolunteerAdminRole[];
}) {
  const nextSortOrder =
    roles.reduce((max, role) => Math.max(max, role.sortOrder), -1) + 1;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {roles.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Todavía no hay roles. Agregá al menos dos: quien se postula elige una
          primera y una segunda opción.
        </p>
      ) : (
        <ul className="grid min-w-0 gap-3">
          {roles.map((role) => (
            <VolunteerRoleRow
              key={role.id}
              festivalId={festivalId}
              role={role}
            />
          ))}
        </ul>
      )}
      <div className="min-w-0 space-y-3 rounded-lg border border-border/70 p-3">
        <h3 className="font-medium">Agregar rol</h3>
        <VolunteerRoleForm
          festivalId={festivalId}
          nextSortOrder={nextSortOrder}
        />
      </div>
    </div>
  );
}

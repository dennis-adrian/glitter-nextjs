import VolunteerShiftForm from "@/app/components/volunteers/admin/volunteer-shift-form";
import VolunteerShiftRow from "@/app/components/volunteers/admin/volunteer-shift-row";
import type { VolunteerShiftCoverage } from "@/app/lib/volunteers/admin-definitions";

/** The call's shifts with their coverage, and the form to add one. */
export default function VolunteerShiftList({
  festivalId,
  shifts,
}: {
  festivalId: number;
  shifts: VolunteerShiftCoverage[];
}) {
  const nextSortOrder =
    shifts.reduce((max, shift) => Math.max(max, shift.sortOrder), -1) + 1;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {shifts.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Todavía no hay turnos. Quien se postula marca en cuáles puede estar.
        </p>
      ) : (
        <ul className="grid min-w-0 gap-3">
          {shifts.map((shift) => (
            <VolunteerShiftRow
              key={shift.id}
              festivalId={festivalId}
              shift={shift}
            />
          ))}
        </ul>
      )}
      <div className="min-w-0 space-y-3 rounded-lg border border-border/70 p-3">
        <h3 className="font-medium">Agregar turno</h3>
        <VolunteerShiftForm
          festivalId={festivalId}
          nextSortOrder={nextSortOrder}
        />
      </div>
    </div>
  );
}

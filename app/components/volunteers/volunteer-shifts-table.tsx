import type { VolunteerShift } from "@/app/lib/volunteers/definitions";
import { formatShiftDay, formatShiftHours } from "@/app/lib/volunteers/format";
import { VOLUNTEER_MAX_SHIFTS_PER_DAY } from "@/app/lib/volunteers/definitions";

/** Placeholder: the active shifts, from the festival's rows. */
export default function VolunteerShiftsTable({
  shifts,
}: {
  shifts: VolunteerShift[];
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Turnos</h2>
      <p className="break-words">
        Cada turno dura 4 horas. El viernes es el día de montaje: armamos las
        mesas y la decoración. Asignamos como máximo{" "}
        {VOLUNTEER_MAX_SHIFTS_PER_DAY} turnos por día.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 font-semibold">Día</th>
              <th className="p-3 font-semibold">Horario</th>
              <th className="p-3 font-semibold">Turno</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="border-t">
                <td className="p-3 whitespace-nowrap">
                  {formatShiftDay(shift.startsAt)}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {formatShiftHours(shift)}
                </td>
                <td className="p-3 break-words">{shift.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import {
  VOLUNTEER_COPY,
  type VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import { formatShiftDay, formatShiftHours } from "@/app/lib/volunteers/format";

/** The active shifts, from the festival's rows, and the two rules about them. */
export default function VolunteerShiftsSection({
  shifts,
}: {
  shifts: VolunteerShift[];
}) {
  return (
    <section id="turnos" className="scroll-mt-20 bg-brand-elevated">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-20 lg:px-20">
        <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
          {VOLUNTEER_COPY.shiftsTitle}
        </h2>
        <p className="mt-4 max-w-2xl break-words text-brand-neutral">
          {VOLUNTEER_COPY.shiftsLead}
        </p>
        <div className="mt-8 overflow-hidden rounded-[20px] border border-brand-border bg-brand-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-brand-border text-brand-neutral">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Día
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Horario
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Turno
                  </th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr
                    key={shift.id}
                    className="border-b border-brand-border last:border-0"
                  >
                    <td className="px-5 py-3.5 font-semibold whitespace-nowrap text-brand-ink">
                      {formatShiftDay(shift.startsAt)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap tabular-nums text-brand-neutral-strong">
                      {formatShiftHours(shift)}
                    </td>
                    <td className="px-5 py-3.5 break-words text-brand-neutral-strong">
                      {shift.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            [VOLUNTEER_COPY.setupDayTitle, VOLUNTEER_COPY.setupDayText],
            [VOLUNTEER_COPY.maxShiftsTitle, VOLUNTEER_COPY.maxShiftsText],
          ].map(([title, text]) => (
            <div
              key={title}
              className="min-w-0 rounded-[20px] bg-brand-lavender p-6"
            >
              <h3 className="font-display text-lg leading-7 font-bold break-words text-brand-ink">
                {title}
              </h3>
              <p className="mt-1 text-sm leading-6 break-words text-brand-neutral-strong">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

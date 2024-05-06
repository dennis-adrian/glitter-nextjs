import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatFullDate, getWeekdayFromDate } from "@/app/lib/formatters";
import { AttendanceType } from "./ticket-creation-form";
import { capitalize } from "@/app/lib/utils";

export function getAttendanceOptions(
  visitor: VisitorWithTickets,
  festival: FestivalBase,
): { label: string; value: AttendanceType }[] {
  const dayOneOption = {
    label: `${capitalize(
      getWeekdayFromDate(festival.startDate),
    )}, ${formatFullDate(festival.startDate)}`,
    value: "day_one" as AttendanceType,
  };
  const dayTwoOption = {
    label: `${capitalize(
      getWeekdayFromDate(festival.endDate),
    )}, ${formatFullDate(festival.endDate)}`,
    value: "day_two" as AttendanceType,
  };
  const bothDaysOption = {
    label: `Ambos días`,
    value: "both" as AttendanceType,
  };

  if (visitor.tickets.length === 1) {
    if (visitor.tickets[0].date.toString() === festival.startDate.toString()) {
      return [dayTwoOption];
    } else if (
      visitor.tickets[0].date.toString() === festival.endDate.toString()
    ) {
      return [dayOneOption];
    }
  }

  if (visitor.tickets.length === 2) {
    return [];
  }

  return [dayOneOption, dayTwoOption, bothDaysOption];
}

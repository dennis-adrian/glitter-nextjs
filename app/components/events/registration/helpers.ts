import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import { AttendanceType } from "./ticket-creation-form";
import { capitalize } from "@/app/lib/utils";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";

export function getAttendanceOptions(
  visitor: VisitorWithTickets,
  festival: FestivalWithDates,
): { label: string; value: AttendanceType }[] {
  const visitorFestivalTickets = getVisitorFestivalTickets(visitor, festival);
  const dateOne = festival.festivalDates[0];
  const dateTwo = festival.festivalDates[1];

  const dayOneOption = {
    label: capitalize(formatFullDate(dateOne.startDate)),
    value: "day_one" as AttendanceType,
  };
  const dayTwoOption = {
    label: capitalize(formatFullDate(dateTwo?.startDate)),
    value: "day_two" as AttendanceType,
  };
  const bothDaysOption = {
    label: `Ambos días`,
    value: "both" as AttendanceType,
  };

  if (visitorFestivalTickets.length === 1) {
    if (
      formatDate(visitorFestivalTickets[0].date).startOf("day") ===
      formatDate(dateOne.startDate).startOf("day")
    ) {
      return [dayTwoOption];
    } else if (
      dateTwo &&
      formatDate(visitorFestivalTickets[0].date).startOf("day") ===
        formatDate(dateTwo.startDate).startOf("day")
    ) {
      return [dayOneOption];
    }
  }

  if (visitorFestivalTickets.length === 2) {
    return [];
  }

  if (!dateTwo) return [dayOneOption];

  return [dayOneOption, dayTwoOption, bothDaysOption];
}

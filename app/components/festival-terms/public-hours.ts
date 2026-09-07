import { DateTime } from "luxon";

/** True when both days have start/end and their clock times match. */
export function haveSameClockTimes(
  dayOneStart: DateTime | null,
  dayTwoStart: DateTime | null,
  dayOneEnd: DateTime | null,
  dayTwoEnd: DateTime | null,
): boolean {
  if (!dayOneStart || !dayTwoStart || !dayOneEnd || !dayTwoEnd) {
    return false;
  }

  return (
    dayOneStart.hour === dayTwoStart.hour &&
    dayOneStart.minute === dayTwoStart.minute &&
    dayOneEnd.hour === dayTwoEnd.hour &&
    dayOneEnd.minute === dayTwoEnd.minute
  );
}

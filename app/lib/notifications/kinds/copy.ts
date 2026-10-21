import { DateTime } from "luxon";

import { formatDisplayDate } from "@/app/lib/formatters";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";

/** Closes the notices whose emails offer it: a decision someone may question. */
export const SUPPORT_LINE = `Si tenés dudas, escribinos a ${PARTICIPANT_SUPPORT_EMAIL}.`;

/** "a las 6:00 PM", or "a la 1:00 PM": one o'clock takes the singular. */
export function atTime(value: string | DateTime) {
  const time = formatDisplayDate(value, DateTime.TIME_SIMPLE);
  return `${time.startsWith("1:") ? "a la" : "a las"} ${time}`;
}

"use client";

import { DateTime } from "luxon";

import { formatDate } from "@/app/lib/formatters";
import {
  CHECK_IN_OUTCOME_LABELS,
  type CheckInOutcome,
  type CheckInResult,
} from "@/app/lib/programs/checkin";

/**
 * Green for the one outcome that lets someone in, amber for the one that is a
 * duplicate rather than a problem, red for everything that stops at the door.
 */
const OUTCOME_STYLE: Record<CheckInOutcome, string> = {
  checked_in: "border-green-300 bg-green-100 text-green-900",
  already_used: "border-amber-300 bg-amber-100 text-amber-900",
  wrong_occurrence: "border-red-300 bg-red-100 text-red-900",
  cancelled: "border-red-300 bg-red-100 text-red-900",
  not_found: "border-red-300 bg-red-100 text-red-900",
  occurrence_closed: "border-red-300 bg-red-100 text-red-900",
};

type Props = { result: CheckInResult };

/** Detail line under the headline — who, or which session instead of this one. */
function detail(result: CheckInResult): string | null {
  switch (result.outcome) {
    case "checked_in":
      return `${result.attendeeName} · ${formatDate(
        result.checkedInAt,
      ).toLocaleString(DateTime.TIME_SIMPLE)}`;
    case "already_used":
      return `${result.attendeeName} · ingresó a las ${formatDate(
        result.checkedInAt,
      ).toLocaleString(DateTime.TIME_SIMPLE)}`;
    case "wrong_occurrence":
      return `Corresponde a: ${result.sessionTitle}`;
    case "cancelled":
      return result.attendeeName;
    default:
      return null;
  }
}

/**
 * The one thing an operator reads between scans, so it is sized to be legible
 * at arm's length rather than styled like the rest of the dashboard.
 */
export default function CheckInResultBanner({ result }: Props) {
  const line = detail(result);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-4 py-3 ${OUTCOME_STYLE[result.outcome]}`}
    >
      <p className="text-sm font-medium">
        {CHECK_IN_OUTCOME_LABELS[result.outcome]}
      </p>
      {line ? <p className="text-sm">{line}</p> : null}
    </div>
  );
}

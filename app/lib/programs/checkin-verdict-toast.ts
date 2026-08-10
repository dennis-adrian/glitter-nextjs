import { DateTime } from "luxon";
import { toast } from "sonner";

import { formatDate } from "@/app/lib/formatters";
import {
  CHECK_IN_OUTCOME_LABELS,
  type CheckInResult,
} from "@/app/lib/programs/checkin";

/**
 * One id for every verdict, so a new scan replaces the previous answer in place
 * instead of stacking behind it. A door works in bursts and only the latest
 * verdict is ever the one being asked about.
 */
const VERDICT_TOAST_ID = "checkin-verdict";

/**
 * Ten seconds, and a close button for the operator who is done sooner.
 *
 * Long enough to survive looking down at the ticket and back up, which is when
 * "did that go through" actually gets asked — the default few seconds is not.
 * Short enough that a verdict does not sit over the screen after the queue has
 * moved on, which is what made an indefinite one worth avoiding.
 */
const options = {
  id: VERDICT_TOAST_ID,
  duration: 10_000,
  closeButton: true,
  position: "top-center",
} as const;

/** Detail line under the headline — who, or which session instead of this one. */
function detail(result: CheckInResult): string | undefined {
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
      return undefined;
  }
}

/**
 * Announces the verdict on a scanned ticket.
 *
 * A toast rather than a panel in the layout: the verdict appears between two
 * scans, and anything that takes up space on arrival shifts the camera the
 * operator is aiming. Sonner's own variants carry the severity, so green,
 * amber and red do not have to be spelled out here.
 *
 * Note that a rejected ticket is not a failed operation — the check ran and the
 * answer was no. Genuine failures (a dropped request, a rejected action) stay
 * on the panel's own transient `toast.error`, which is how they remain
 * distinguishable from a ticket that simply cannot come in.
 */
export function showCheckInVerdict(result: CheckInResult): void {
  const message = CHECK_IN_OUTCOME_LABELS[result.outcome];
  const description = detail(result);

  switch (result.outcome) {
    case "checked_in":
      toast.success(message, { ...options, description });
      return;
    case "already_used":
      toast.warning(message, { ...options, description });
      return;
    default:
      toast.error(message, { ...options, description });
  }
}

/** Drops the verdict on screen, if any. */
export function dismissCheckInVerdict(): void {
  toast.dismiss(VERDICT_TOAST_ID);
}

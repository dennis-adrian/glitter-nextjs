import {
  AlertCircleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";

import type { ParticipantStatusCopy } from "@/app/lib/reservations/participant-status";

const TONE_STYLES: Record<
  ParticipantStatusCopy["tone"],
  { badge: string; icon: LucideIcon }
> = {
  action: {
    badge: "bg-amber-100 border-amber-300 text-amber-900",
    icon: AlertCircleIcon,
  },
  waiting: {
    badge: "bg-blue-100 border-blue-300 text-blue-900",
    icon: ClockIcon,
  },
  done: {
    badge: "bg-green-100 border-green-300 text-green-900",
    icon: CheckCircle2Icon,
  },
  closed: {
    badge: "bg-gray-100 border-gray-300 text-gray-700",
    icon: XCircleIcon,
  },
};

/**
 * What state the reservation is in, and what the participant should do about
 * it.
 *
 * The state is the first question this page answers, so it is the first thing
 * on it and the only thing at that weight: a badge carrying its own icon — the
 * shape the portal card already uses for the same statuses — over one line of
 * plain foreground text. Everything used to be grey at 14px, which left the
 * page with no first thing to read.
 *
 * The deadline rides here rather than sitting as one more row in the summary
 * below. A date is only urgent next to the thing it expires, and it is tinted
 * only while it is the participant's to act on: a payment under review has a
 * due date too, and pressing somebody about a clock they cannot stop is noise.
 *
 * Colour is never the only carrier: four tones distinguish states the text
 * already names, and each has its own icon, so this reads correctly in
 * greyscale and to a screen reader.
 */
export default function ReservationStatusPanel({
  copy,
  deadlineLabel,
}: {
  copy: ParticipantStatusCopy;
  /** The payment deadline, already formatted. Only while one is owed. */
  deadlineLabel?: string | null;
}) {
  const tone = TONE_STYLES[copy.tone];
  const ToneIcon = tone.icon;

  return (
    <div className="space-y-3">
      <Badge
        variant="outline"
        size="lg"
        className={cn("gap-1.5 font-medium", tone.badge)}
      >
        <ToneIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {copy.label}
      </Badge>

      <div className="space-y-1">
        <p className="text-base font-medium leading-snug">{copy.description}</p>
        {copy.whatNext && (
          <p className="text-sm text-muted-foreground">{copy.whatNext}</p>
        )}
      </div>

      {deadlineLabel && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 text-sm",
            copy.tone === "action"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "bg-muted",
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarClockIcon
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            Fecha límite
          </span>
          <span className="font-semibold">{deadlineLabel}</span>
        </div>
      )}
    </div>
  );
}

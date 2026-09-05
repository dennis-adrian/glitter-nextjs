import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";

import type { ParticipantStatusCopy } from "@/app/lib/reservations/participant-status";

const TONE_STYLES: Record<ParticipantStatusCopy["tone"], string> = {
  action: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  waiting: "bg-blue-100 text-blue-900 hover:bg-blue-100",
  done: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  closed: "bg-muted text-muted-foreground hover:bg-muted",
};

/**
 * What state the reservation is in, and what the participant should do about
 * it.
 *
 * The badge is never the only carrier of the state: colour distinguishes four
 * tones that the text already names, so the panel still reads correctly in
 * greyscale and to a screen reader.
 */
export default function ReservationStatusPanel({
  copy,
}: {
  copy: ParticipantStatusCopy;
}) {
  return (
    <div className="space-y-2">
      <Badge className={cn("font-medium", TONE_STYLES[copy.tone])}>
        {copy.label}
      </Badge>
      <p className="text-sm text-muted-foreground">{copy.description}</p>
      {copy.whatNext && <p className="text-sm">{copy.whatNext}</p>}
    </div>
  );
}

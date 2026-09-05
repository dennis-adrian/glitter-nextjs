import { Banner, type BannerVariant } from "@/app/components/ui/banner";

import type { ParticipantStatusCopy } from "@/app/lib/reservations/participant-status";

const TONE_VARIANT: Record<ParticipantStatusCopy["tone"], BannerVariant> = {
  action: "warning",
  waiting: "info",
  done: "success",
  closed: "note",
};

/**
 * What state the reservation is in, and what the participant should do about
 * it.
 *
 * A `Banner` rather than the bare badge it used to be: the state is the first
 * question this page answers, and a small pill above two grey lines made the
 * loudest thing on the card its least important. This is also the shape the
 * rest of the app already uses for "here is where you stand" — the portal card
 * says the same things the same way.
 *
 * The deadline rides here instead of sitting as one more row in the summary
 * below. A date is only urgent next to the thing it expires, and a reservation
 * that is `pending` is exactly a reservation with a clock on it.
 *
 * Colour is never the only carrier: four tones distinguish states the text
 * already names, so this reads correctly in greyscale and to a screen reader.
 */
export default function ReservationStatusPanel({
  copy,
  deadlineLabel,
}: {
  copy: ParticipantStatusCopy;
  /** The payment deadline, already formatted. Only while one is owed. */
  deadlineLabel?: string | null;
}) {
  return (
    <Banner variant={TONE_VARIANT[copy.tone]} title={copy.label}>
      <p>{copy.description}</p>
      {copy.whatNext && <p className="mt-1">{copy.whatNext}</p>}
      {deadlineLabel && (
        <p className="mt-2 font-semibold">Fecha límite: {deadlineLabel}</p>
      )}
    </Banner>
  );
}

import Image from "next/image";
import { SparklesIcon } from "lucide-react";

import type { FestivalBase } from "@/app/lib/festivals/definitions";

/**
 * The festival's own artwork, at the shape a poster is drawn in.
 *
 * `aspect-4/5` and the `poster → banner → thumbnail` fallback are both lifted
 * from `festival-page-hero` and the participation history, so the same festival
 * looks like itself everywhere it appears. The reservation card used to run its
 * own `aspect-3/1` strip off `thumbnailUrl` alone, which is why a festival with
 * a poster and no thumbnail showed a plain orange gradient.
 *
 * A portrait poster cannot be cropped into a wide strip without losing most of
 * it, so the card gives it a column instead of a band.
 */
export default function FestivalPosterThumb({
  festival,
}: {
  festival: Pick<
    FestivalBase,
    "name" | "posterUrl" | "festivalBannerUrl" | "thumbnailUrl"
  >;
}) {
  const artwork =
    festival.posterUrl ?? festival.festivalBannerUrl ?? festival.thumbnailUrl;

  if (artwork) {
    return (
      <div className="relative aspect-4/5 w-20 shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm sm:w-24">
        <Image
          src={artwork}
          alt={`Afiche de ${festival.name}`}
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>
    );
  }

  // Same footprint as the artwork so the header does not reflow between a
  // festival that has a poster and one that does not.
  return (
    <div
      role="img"
      aria-label={`Identidad visual de ${festival.name}`}
      className="relative flex aspect-4/5 w-20 shrink-0 overflow-hidden rounded-lg bg-linear-to-br from-amber-600 to-amber-400 p-2 text-white shadow-sm sm:w-24"
    >
      <SparklesIcon className="relative mt-auto size-5" aria-hidden="true" />
    </div>
  );
}

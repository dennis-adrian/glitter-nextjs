import type { FestivalActivity } from "@/app/lib/festivals/definitions";

export default function FestivalNavMapLegend({
  activityTypes,
}: {
  activityTypes: FestivalActivity["type"][];
}) {
  const activityTypeSet = new Set(activityTypes);
  const hasActivityBadges =
    activityTypeSet.has("coupon_book") ||
    activityTypeSet.has("stamp_passport") ||
    activityTypeSet.has("sticker_hunt");

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
      <div role="group" aria-label="Color del stand">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 rounded-sm border border-[rgba(91,33,182,0.8)] bg-[rgba(109,40,217,0.85)]"
              aria-hidden="true"
            />
            <span className="text-xs text-foreground">Ocupado</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 rounded-sm border border-[rgba(139,92,246,0.6)] bg-[rgba(221,214,254,0.6)]"
              aria-hidden="true"
            />
            <span className="text-xs text-foreground">Disponible</span>
          </div>
        </div>
      </div>

      {hasActivityBadges ? (
        <>
          <div
            className="hidden h-5 w-px shrink-0 bg-border md:block"
            aria-hidden="true"
          />
          <div
            role="group"
            aria-label="Insignias sobre el stand"
            className="border-t pt-2 md:border-t-0 md:pt-0"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {activityTypeSet.has("coupon_book") ? (
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-3.5 items-center justify-center rounded-full border border-amber-700 bg-amber-600 text-[7px] font-bold leading-none text-white"
                    aria-hidden="true"
                  >
                    %
                  </span>
                  <span className="text-xs text-foreground">En cuponera</span>
                </div>
              ) : null}
              {activityTypeSet.has("stamp_passport") ? (
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-3.5 items-center justify-center rounded-full border border-emerald-800 bg-emerald-600 text-[7px] font-bold leading-none text-white"
                    aria-hidden="true"
                  >
                    ★
                  </span>
                  <span className="text-xs text-foreground">
                    Carrera de sellos
                  </span>
                </div>
              ) : null}
              {activityTypeSet.has("sticker_hunt") ? (
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-3.5 items-center justify-center rounded-full border border-pink-800 bg-pink-600 text-[7px] font-bold leading-none text-white"
                    aria-hidden="true"
                  >
                    ♦
                  </span>
                  <span className="text-xs text-foreground">
                    Cacería de stickers
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

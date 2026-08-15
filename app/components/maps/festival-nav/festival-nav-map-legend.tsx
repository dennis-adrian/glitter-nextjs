import type { FestivalActivity } from "@/app/lib/festivals/definitions";

export default function FestivalNavMapLegend({
  activityTypes,
}: {
  activityTypes: FestivalActivity["type"][];
}) {
  const activityTypeSet = new Set(activityTypes);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-3.5 rounded-sm bg-[rgba(109,40,217,0.85)] border border-[rgba(91,33,182,0.8)]" />
        <span className="text-xs text-foreground">Ocupado</span>
      </div>
      {activityTypeSet.has("coupon_book") ? (
        <div className="flex items-center gap-2">
          <div className="relative h-3.5 w-3.5 rounded-sm bg-[rgba(217,119,6,0.85)] border border-[rgba(146,64,14,0.8)]">
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white leading-none">
              %
            </span>
          </div>
          <span className="text-xs text-foreground">En cuponera</span>
        </div>
      ) : null}
      {activityTypeSet.has("stamp_passport") ? (
        <div className="flex items-center gap-2">
          <div className="relative h-3.5 w-3.5 rounded-sm bg-[rgba(5,150,105,0.85)] border border-[rgba(6,95,70,0.8)]">
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white leading-none">
              ★
            </span>
          </div>
          <span className="text-xs text-foreground">Carrera de sellos</span>
        </div>
      ) : null}
      {activityTypeSet.has("sticker_hunt") ? (
        <div className="flex items-center gap-2">
          <div className="relative h-3.5 w-3.5 rounded-sm bg-[rgba(219,39,119,0.85)] border border-[rgba(157,23,77,0.8)]">
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-white leading-none">
              ♦
            </span>
          </div>
          <span className="text-xs text-foreground">Cacería de stickers</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <div className="h-3.5 w-3.5 rounded-sm bg-[rgba(221,214,254,0.6)] border border-[rgba(139,92,246,0.6)]" />
        <span className="text-xs text-foreground">Disponible</span>
      </div>
    </div>
  );
}

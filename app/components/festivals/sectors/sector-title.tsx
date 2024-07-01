import CategoryBadge from "@/app/components/category-badge";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";

type SectorTitleProps = {
  sector: FestivalSectorWithStandsWithReservationsWithParticipants;
};

export default function FestivalSectorTitle(props: SectorTitleProps) {
  const sectorCategories = getFestivalSectorAllowedCategories(props.sector);
  return (
    <div className="self-start flex flex-col">
      <div className="flex gap-3 mt-4 self-start flex-wrap">
        <h3 className="font-semibold text-xl">{props.sector.name}</h3>
        {sectorCategories.length > 0 && (
          <div className="flex gap-1 items-center flex-wrap">
            {sectorCategories.map((category) => (
              <CategoryBadge
                key={category}
                category={category}
                useOccupationLabel={false}
              />
            ))}
          </div>
        )}
      </div>
      <div className="my-3 text-sm text-muted-foreground">
        <ul>
          <li className="flex items-center gap-2">
            <div className="w-[12px] h-[12px] bg-white border"></div>
            Disponible
          </li>
          <li className="flex items-center gap-2">
            <div className="w-[12px] h-[12px] bg-emerald-200"></div>
            Reservado
          </li>
          <li className="flex items-center gap-2">
            <div className="w-[12px] h-[12px] bg-rose-600"></div>
            Confirmado
          </li>
          <li className="flex items-center gap-2">
            <div className="bg-zinc-800 w-[12px] h-[12px]"></div>
            Deshabilitado
          </li>
        </ul>
      </div>
    </div>
  );
}

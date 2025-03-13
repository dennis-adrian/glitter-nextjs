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
        <ul className="flex flex-wrap gap-2 max-w-[220px] md:max-w-full">
          <li className="flex items-center gap-1">
            <div className="w-4 h-4 bg-white border rounded-sm"></div>
            Disponible
          </li>
          <li className="flex items-center gap-1">
            <div className="w-4 h-4 bg-emerald-200 rounded-sm"></div>
            Reservado
          </li>
          <li className="flex items-center gap-1">
            <div className="w-4 h-4 bg-rose-400 rounded-sm"></div>
            Confirmado
          </li>
          <li className="flex items-center gap-1">
            <div className="bg-zinc-600 w-4 h-4 rounded-sm"></div>
            Deshabilitado
          </li>
        </ul>
      </div>
    </div>
  );
}

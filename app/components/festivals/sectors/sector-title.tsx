import CategoryBadge from "@/app/components/category-badge";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";

type SectorTitleProps = {
  sector: FestivalSectorWithStandsWithReservationsWithParticipants;
};

export default function FestivalSectorTitle(props: SectorTitleProps) {
  const sectorCategories = getFestivalSectorAllowedCategories(props.sector);
  return (
    <div className="flex gap-3 my-4 self-start flex-wrap">
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
  );
}

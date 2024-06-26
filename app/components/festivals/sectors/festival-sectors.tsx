import FestivalSector from "@/app/components/festivals/sectors/festival-sector";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { Suspense } from "react";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";

type FestivalSectorsProps = {
  festival: FestivalBase;
};

export default async function FestivalSectors(props: FestivalSectorsProps) {
  const sectors = await fetchFestivalSectors(props.festival.id);
  if (sectors.length === 0) {
    return (
      <div>
        <p className="text-center text-gray-500 pt-8">
          No se han encontrado sectores para este festival.
        </p>
      </div>
    );
  }

  return (
    sectors.length > 0 && (
      <div className="flex flex-col gap-4">
        {sectors.map((sector) => (
          <Suspense key={sector.id} fallback={<FestivalSkeleton />}>
            <FestivalSector sector={sector} />
          </Suspense>
        ))}
      </div>
    )
  );
}

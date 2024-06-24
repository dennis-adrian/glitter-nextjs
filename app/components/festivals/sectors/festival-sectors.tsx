import FestivalSector from "@/app/components/festivals/sectors/festival-sector";
import FestivalSkeleton from "@/app/components/festivals/festival-skeleton";
import {
  FestivalSectorWithStandsWithReservationsWithParticipants,
  FestivalWithDatesAndSectors,
} from "@/app/data/festivals/definitions";
import { Suspense } from "react";
import { orderSectors } from "@/app/data/festivals/helpers";

type FestivalSectorsProps = {
  festival: FestivalWithDatesAndSectors;
};

export default function FestivalSectors(props: FestivalSectorsProps) {
  const orderedSectors = orderSectors(
    props.festival.festivalSectors,
  ) as FestivalSectorWithStandsWithReservationsWithParticipants[];

  return (
    props.festival.festivalSectors.length > 0 && (
      <div className="flex flex-col gap-4">
        {orderedSectors.map((sector) => (
          <Suspense key={sector.id} fallback={<FestivalSkeleton />}>
            <FestivalSector sector={sector} />
          </Suspense>
        ))}
      </div>
    )
  );
}

import MapImage from "@/app/components/festivals/map-image";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/data/festivals/definitions";

type FestivalSectorProps = {
  sector: FestivalSectorWithStandsWithReservationsWithParticipants;
};

export default function FestivalSector(props: FestivalSectorProps) {
  return (
    <div key={props.sector.id}>
      <h3 className="font-semibold text-xl my-4">{props.sector.name}</h3>
      {props.sector.stands.length > 0 && props.sector.mapUrl ? (
        <div className="flex flex-wrap gap-2">
          <MapImage mapSrc={props.sector.mapUrl} stands={props.sector.stands} />
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">
          No hay mapa definido para este sector
        </div>
      )}
    </div>
  );
}

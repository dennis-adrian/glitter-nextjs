import MapImage from "@/app/components/festivals/map-image";
import ParticipantsGrid from "@/app/components/festivals/participants";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/data/festivals/definitions";

type FestivalSectorProps = {
  sector: FestivalSectorWithStandsWithReservationsWithParticipants;
};

export default function FestivalSector(props: FestivalSectorProps) {
  return (
    <div key={props.sector.id}>
      <h3 className="font-semibold text-xl my-4">{props.sector.name}</h3>
      {props.sector.stands.length > 0 && props.sector.mapUrl ? (
        <div className="flex flex-wrap gap-4 justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="mx-auto">
              <MapImage
                mapSrc={props.sector.mapUrl}
                stands={props.sector.stands}
              />
            </div>
            <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
              El plano muestra las ubicaciones y la distribución confirmada de
              los stands. Las medidas y proporciones de todos los elementos son
              estimadas y se utilizan de manera orientativa.
            </p>
          </div>
          <ParticipantsGrid stands={props.sector.stands} />
        </div>
      ) : (
        <div className="text-muted-foreground text-sm">
          Espacios no definidos para este sector
        </div>
      )}
    </div>
  );
}

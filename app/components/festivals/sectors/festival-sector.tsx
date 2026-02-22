import { StandBase } from "@/app/api/stands/definitions";
import { BaseProfile, Participation } from "@/app/api/users/definitions";
import PublicMap from "@/app/components/maps/public/public-map";
import ParticipantsGrid from "@/app/components/festivals/participants";
import FestivalSectorTitle from "@/app/components/festivals/sectors/sector-title";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { Suspense } from "react";

type FestivalSectorProps = {
	sector: FestivalSectorWithStandsWithReservationsWithParticipants;
	profiles: (BaseProfile & {
		stands: StandBase[];
		participations: Participation[];
	})[];
};

export default function FestivalSector(props: FestivalSectorProps) {
	return (
		<div key={props.sector.id}>
			<FestivalSectorTitle sector={props.sector} />
			{props.sector.stands.length > 0 ? (
				<div className="flex flex-wrap gap-4 justify-center">
					<div className="flex flex-col items-center gap-2">
						<div className="w-full md:max-w-2xl mx-auto">
							<PublicMap
								stands={props.sector.stands}
								mapElements={props.sector.mapElements ?? []}
								sectorName={props.sector.name}
								mapBounds={
									props.sector.mapOriginX != null &&
									props.sector.mapOriginY != null &&
									props.sector.mapWidth != null &&
									props.sector.mapHeight != null
										? {
												minX: props.sector.mapOriginX,
												minY: props.sector.mapOriginY,
												width: props.sector.mapWidth,
												height: props.sector.mapHeight,
											}
										: undefined
								}
							/>
						</div>
						<p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4 max-w-[400px]">
							El plano muestra las ubicaciones y la distribución confirmada de
							los stands. Las medidas y proporciones de todos los elementos son
							estimadas y se utilizan de manera orientativa.
						</p>
					</div>
					<Suspense
						fallback={
							<div className="w-full justify-center mt-5">Cargando...</div>
						}
					>
						<ParticipantsGrid
							stands={props.sector.stands}
							participants={props.profiles}
							festivalId={props.sector.festivalId}
						/>
					</Suspense>
				</div>
			) : (
				<div className="text-muted-foreground text-sm">
					Espacios no definidos para este sector
				</div>
			)}
		</div>
	);
}

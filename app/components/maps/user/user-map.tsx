"use client";

import type {
  ReservationMapElementDto,
  ReservationMapProfileDto,
  ReservationMapStandDto,
} from "@/app/lib/reservations/dto";
import { canStandBeReserved } from "@/app/lib/stands/helpers";

import MapLegend from "@/app/components/maps/map-legend";
import MapSurface from "@/app/components/maps/map-surface";
import MapToolbar from "@/app/components/maps/map-toolbar";
import ZoomableMapFrame from "@/app/components/maps/zoomable-map-frame";
import { MapBounds } from "@/app/components/maps/map-types";
import { getExternalParticipantStandColors } from "@/app/components/maps/map-utils";
import { hasExternalParticipants } from "@/app/components/maps/map-participants";

type UserMapProps = {
  stands: ReservationMapStandDto[];
  mapElements?: ReservationMapElementDto[];
  mapBounds?: MapBounds;
  profile?: ReservationMapProfileDto | null;
  selectedStandId?: number | null;
  subcategoryIds?: number[];
  onStandClick?: (stand: ReservationMapStandDto) => void;
  onStandTouchTap?: (stand: ReservationMapStandDto) => void;
};

export default function UserMap({
  stands,
  mapElements,
  mapBounds,
  profile,
  selectedStandId,
  subcategoryIds = [],
  onStandClick,
  onStandTouchTap,
}: UserMapProps) {
  return (
    <ZoomableMapFrame
      header={
        <>
          <MapLegend />
          <MapToolbar />
        </>
      }
    >
      <MapSurface
        stands={stands}
        mapElements={mapElements}
        mapBounds={mapBounds}
        selectedStandId={selectedStandId}
        canBeReserved={(stand) =>
          !!profile && canStandBeReserved(stand, profile, subcategoryIds)
        }
        getColors={(stand) =>
          hasExternalParticipants(stand)
            ? getExternalParticipantStandColors()
            : undefined
        }
        onStandClick={onStandClick}
        onStandTouchTap={onStandTouchTap}
      />
    </ZoomableMapFrame>
  );
}

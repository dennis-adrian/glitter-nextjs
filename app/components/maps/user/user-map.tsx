"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { canStandBeReserved } from "@/app/lib/stands/helpers";

import MapLegend from "@/app/components/maps/map-legend";
import MapSurface from "@/app/components/maps/map-surface";
import MapToolbar from "@/app/components/maps/map-toolbar";
import ZoomableMapFrame from "@/app/components/maps/zoomable-map-frame";
import { MapBounds } from "@/app/components/maps/map-types";
import { getExternalParticipantStandColors } from "@/app/components/maps/map-utils";
import { hasExternalParticipants } from "@/app/components/maps/map-participants";

type UserMapProps = {
  stands: StandWithReservationsWithParticipants[];
  mapElements?: MapElementBase[];
  mapBounds?: MapBounds;
  profile?: ProfileType | BaseProfile | null;
  selectedStandId?: number | null;
  subcategoryIds?: number[];
  onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
  onStandTouchTap?: (stand: StandWithReservationsWithParticipants) => void;
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

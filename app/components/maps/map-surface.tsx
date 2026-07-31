"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { MapBounds } from "@/app/components/maps/map-types";
import {
  StandColors,
  computeCanvasBounds,
} from "@/app/components/maps/map-utils";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapElement from "@/app/components/maps/map-element";
import MapStand from "@/app/components/maps/map-stand";

type MapSurfaceProps = {
  stands: StandWithReservationsWithParticipants[];
  mapElements?: MapElementBase[];
  /** Explicit viewBox. Falls back to bounds computed from stands and elements */
  mapBounds?: MapBounds;
  selectedStandId?: number | null;
  /** Returning undefined leaves MapStand on its status-based default palette */
  getColors?: (
    stand: StandWithReservationsWithParticipants,
  ) => StandColors | undefined;
  canBeReserved?: (stand: StandWithReservationsWithParticipants) => boolean;
  onStandClick?: (stand: StandWithReservationsWithParticipants) => void;
  onStandTouchTap?: (
    stand: StandWithReservationsWithParticipants,
    rect?: DOMRect,
  ) => void;
  onStandHoverChange?: (
    stand: StandWithReservationsWithParticipants | null,
    rect: DOMRect | null,
  ) => void;
  /** Extra SVG content painted on top of the stands */
  children?: React.ReactNode;
};

const noColors = () => undefined;
const notReservable = () => false;

/**
 * The SVG body shared by every stand map: canvas viewBox, map elements and the
 * stands themselves. Callers own the color, filtering and interaction policy.
 */
export default function MapSurface({
  stands,
  mapElements,
  mapBounds,
  selectedStandId,
  getColors = noColors,
  canBeReserved = notReservable,
  onStandClick,
  onStandTouchTap,
  onStandHoverChange,
  children,
}: MapSurfaceProps) {
  const bounds = mapBounds ?? computeCanvasBounds(stands, mapElements);

  return (
    <MapCanvas config={bounds}>
      {mapElements?.map((element) => (
        <MapElement key={`el-${element.id}`} element={element} />
      ))}
      {stands.map((stand) => (
        <MapStand
          key={stand.id}
          stand={stand}
          canBeReserved={canBeReserved(stand)}
          selected={stand.id === selectedStandId}
          colors={getColors(stand)}
          onClick={onStandClick}
          onTouchTap={onStandTouchTap}
          onHoverChange={onStandHoverChange}
        />
      ))}
      {children}
    </MapCanvas>
  );
}

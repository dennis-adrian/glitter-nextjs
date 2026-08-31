"use client";

import { useMemo } from "react";

import {
  MapBounds,
  MapElementLike,
  MapStandLike,
} from "@/app/components/maps/map-types";
import {
  StandColors,
  computeCanvasBounds,
} from "@/app/components/maps/map-utils";
import {
  indexJointGroupsByStandId,
  resolveJointGroups,
} from "@/app/lib/stands/groups";
import MapCanvas from "@/app/components/maps/map-canvas";
import MapElement from "@/app/components/maps/map-element";
import MapStand from "@/app/components/maps/map-stand";
import MapStandGroup from "@/app/components/maps/map-stand-group";

type MapSurfaceProps<T extends MapStandLike = MapStandLike> = {
  stands: T[];
  mapElements?: MapElementLike[];
  /** Explicit viewBox. Falls back to bounds computed from stands and elements */
  mapBounds?: MapBounds;
  selectedStandId?: number | null;
  highlightedStandId?: number | null;
  highlightRequestId?: number;
  dimmedStandIds?: ReadonlySet<number>;
  /** Returning undefined leaves MapStand on its status-based default palette */
  getColors?: (stand: T) => StandColors | undefined;
  canBeReserved?: (stand: T) => boolean;
  onStandClick?: (stand: T) => void;
  onStandTouchTap?: (stand: T, rect?: DOMRect) => void;
  onStandHoverChange?: (stand: T | null, rect: DOMRect | null) => void;
  /**
   * Draw admin-declared groups as one joined stand. Views that encode per-stand
   * state in a stand's color must opt out, since one outline can only carry one
   * color and would hide the difference between members.
   */
  joinGroups?: boolean;
  /** Extra SVG content painted on top of the stands */
  children?: React.ReactNode;
};

const noColors = () => undefined;
const notReservable = () => false;

/**
 * The SVG body shared by every stand map: canvas viewBox, map elements and the
 * stands themselves. Callers own the color, filtering and interaction policy.
 */
export default function MapSurface<T extends MapStandLike>({
  stands,
  mapElements,
  mapBounds,
  selectedStandId,
  highlightedStandId,
  highlightRequestId,
  dimmedStandIds,
  getColors = noColors,
  canBeReserved = notReservable,
  onStandClick,
  onStandTouchTap,
  onStandHoverChange,
  joinGroups = true,
  children,
}: MapSurfaceProps<T>) {
  const bounds = mapBounds ?? computeCanvasBounds(stands, mapElements);
  const jointGroups = useMemo(
    () => (joinGroups ? resolveJointGroups(stands) : []),
    [stands, joinGroups],
  );
  const groupByStandId = useMemo(
    () => indexJointGroupsByStandId(jointGroups),
    [jointGroups],
  );

  // MapStand/MapStandGroup render MapStandLike; T is only a stand subtype.
  const onClick = onStandClick as ((stand: MapStandLike) => void) | undefined;
  const onTouchTap = onStandTouchTap as
    | ((stand: MapStandLike, rect?: DOMRect) => void)
    | undefined;
  const onHoverChange = onStandHoverChange as
    | ((stand: MapStandLike | null, rect: DOMRect | null) => void)
    | undefined;

  return (
    <MapCanvas config={bounds}>
      {mapElements?.map((element) => (
        <MapElement key={`el-${element.id}`} element={element} />
      ))}
      {stands.map((stand) =>
        // Members render once, as part of their group's joined outline
        groupByStandId.has(stand.id) ? null : (
          <MapStand
            key={stand.id}
            stand={stand}
            canBeReserved={canBeReserved(stand)}
            selected={stand.id === selectedStandId}
            highlighted={stand.id === highlightedStandId}
            highlightRequestId={highlightRequestId}
            dimmed={dimmedStandIds?.has(stand.id)}
            colors={getColors(stand)}
            onClick={onClick}
            onTouchTap={onTouchTap}
            onHoverChange={onHoverChange}
          />
        ),
      )}
      {jointGroups.map((group) => {
        const selectedGroupStand =
          group.stands.find((stand) => stand.id === highlightedStandId) ??
          group.stands.find((stand) => stand.id === selectedStandId);

        return (
          <MapStandGroup
            key={`group-${group.id}`}
            group={group}
            selected={group.stands.some((s) => s.id === selectedStandId)}
            highlighted={group.stands.some((s) => s.id === highlightedStandId)}
            highlightRequestId={highlightRequestId}
            dimmed={group.stands.every((stand) =>
              dimmedStandIds?.has(stand.id),
            )}
            mapStandId={selectedGroupStand?.id}
            colors={getColors(group.stands[0])}
            onClick={onClick}
            onTouchTap={onTouchTap}
            onHoverChange={onHoverChange}
          />
        );
      })}
      {children}
    </MapCanvas>
  );
}

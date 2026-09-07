import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import type { MapElementBase } from "@/app/lib/map_elements/definitions";

export type MapBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type MapCanvasConfig = MapBounds & {
  backgroundColor: string;
};

/** Geometry and occupancy fields every stand map renderer needs. */
export type MapStandLike = {
  id: number;
  label: string | null;
  standNumber: number;
  status: string;
  positionLeft: number | null;
  positionTop: number | null;
  standGroupId: number | null;
  occupantKey?: string | null;
  hasExternalOccupant?: boolean;
  reservations?: StandWithReservationsWithParticipants["reservations"];
};

export type StandClickHandler = (stand: MapStandLike) => void;

/** Visual fields every map renderer needs; omits sector/audit columns. */
export type MapElementLike = Pick<
  MapElementBase,
  | "id"
  | "type"
  | "label"
  | "labelPosition"
  | "labelFontSize"
  | "labelFontWeight"
  | "showIcon"
  | "positionLeft"
  | "positionTop"
  | "width"
  | "height"
  | "rotation"
>;

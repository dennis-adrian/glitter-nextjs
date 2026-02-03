"use client";

import { forwardRef, useState } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
  STAND_SIZE,
  getStandPosition,
  getStandFillColor,
  getStandHoverFillColor,
  getStandStrokeColor,
} from "./map-utils";

type MapStandProps = {
  stand: StandWithReservationsWithParticipants;
  canBeReserved: boolean;
  onClick?: (stand: StandWithReservationsWithParticipants) => void;
};

const MapStand = forwardRef<SVGGElement, MapStandProps>(
  ({ stand, canBeReserved, onClick }, ref) => {
    const [hovered, setHovered] = useState(false);
    const { left, top } = getStandPosition(stand);
    const { standNumber, status } = stand;

    const fillColor = hovered
      ? getStandHoverFillColor(status, canBeReserved)
      : getStandFillColor(status, canBeReserved);
    const strokeColor = getStandStrokeColor(status, canBeReserved);

    const handleClick = () => {
      if (!canBeReserved || !onClick) return;
      onClick(stand);
    };

    return (
      <g
        ref={ref}
        transform={`translate(${left}, ${top})`}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: canBeReserved ? "pointer" : "default" }}
        role="button"
        aria-label={`Espacio ${stand.label || ""}${standNumber} - ${status}`}
        tabIndex={canBeReserved ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <rect
          width={STAND_SIZE}
          height={STAND_SIZE}
          rx={0.4}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={0.2}
          style={{ transition: "fill 150ms ease" }}
        />
        <text
          x={STAND_SIZE / 2}
          y={STAND_SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={2.2}
          fontWeight={500}
          fill="#374151"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {stand.label}{standNumber}
        </text>
      </g>
    );
  },
);

MapStand.displayName = "MapStand";
export default MapStand;

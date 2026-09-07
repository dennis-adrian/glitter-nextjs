"use client";

import { memo, useRef, useState } from "react";

import {
  JointGroup,
  buildJointGroupPath,
  getJointGroupBounds,
} from "@/app/lib/stands/groups";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import type { MapStandLike } from "@/app/components/maps/map-types";
import {
  SELECTED_FILL,
  SELECTED_RING,
  SELECTED_STROKE,
  SELECTED_TEXT,
  STAND_SIZE,
  getStandFillColor,
  getStandHoverFillColor,
  getStandStrokeColor,
  getStandTextColor,
  getStandPosition,
  DIMMED_COLORS,
  DIMMED_OPACITY,
} from "./map-utils";
import type { StandColors } from "./map-utils";

type MapStandGroupProps = {
  group: JointGroup<MapStandLike>;
  selected?: boolean;
  highlighted?: boolean;
  highlightRequestId?: number;
  dimmed?: boolean;
  mapStandId?: number;
  colors?: StandColors;
  onClick?: { (stand: MapStandLike): void };
  onTouchTap?: { (stand: MapStandLike, rect?: DOMRect): void };
  onHoverChange?: { (stand: MapStandLike | null, rect: DOMRect | null): void };
};

const RING_PADDING = 0.8;

/**
 * Stands an admin declared as one physical unit, drawn as a single outline with
 * a notch at each seam. Hovering or tapping any member acts on the whole group,
 * and handlers receive the first member as the group's representative stand.
 */
const MapStandGroup = ({
  group,
  selected,
  highlighted,
  highlightRequestId,
  dimmed,
  mapStandId,
  colors,
  onClick,
  onTouchTap,
  onHoverChange,
}: MapStandGroupProps) => {
  const [hovered, setHovered] = useState(false);
  const gRef = useRef<SVGGElement>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const primaryStand = group.stands[0];
  const { status } = primaryStand;
  const bounds = getJointGroupBounds(group);
  const path = buildJointGroupPath(bounds, group.axis);

  // Matches MapStand: filtered out means neutral grey, not a faded status color.
  const activeColors = dimmed && !selected ? DIMMED_COLORS : colors;
  const fillColor = selected
    ? SELECTED_FILL
    : activeColors
      ? hovered
        ? activeColors.hoverFill
        : activeColors.fill
      : hovered
        ? getStandHoverFillColor(status, false)
        : getStandFillColor(status, false);
  const strokeColor = selected
    ? SELECTED_STROKE
    : (activeColors?.stroke ?? getStandStrokeColor(status, false));
  const textColor = selected
    ? SELECTED_TEXT
    : (activeColors?.text ?? getStandTextColor(status, false));

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      touchStartPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      const start = touchStartPos.current;
      touchStartPos.current = null;
      if (start) {
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx < 10 && dy < 10) {
          onTouchTap?.(primaryStand, gRef.current?.getBoundingClientRect());
        }
      }
    } else {
      onClick?.(primaryStand);
    }
  };

  const label = group.stands.map(formatStandLabel).join(" - ");

  return (
    <g
      ref={gRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setHovered(true);
        if (onHoverChange && gRef.current) {
          onHoverChange(primaryStand, gRef.current.getBoundingClientRect());
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        setHovered(false);
        onHoverChange?.(null, null);
      }}
      style={{
        cursor: onClick ? "pointer" : "default",
        touchAction: "manipulation",
        outline: "none",
        opacity: dimmed && !selected ? DIMMED_OPACITY : 1,
        transition: "opacity 180ms ease",
      }}
      role={onClick ? "button" : undefined}
      id={`festival-map-stand-${mapStandId ?? primaryStand.id}`}
      data-map-stand-id={mapStandId ?? primaryStand.id}
      aria-label={`Espacios unidos ${label} - ${status}`}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(primaryStand);
        }
      }}
    >
      {/* Outer ring when selected, traced along the joined outline */}
      {selected && (
        <path
          key={highlightRequestId}
          d={path}
          className={highlighted ? "festival-map-locate-ring" : undefined}
          fill={SELECTED_RING}
          stroke={SELECTED_RING}
          strokeWidth={RING_PADDING * 2}
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
      <path
        d={path}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={selected ? 0.3 : 0.4}
        style={{ transition: "fill 150ms ease" }}
      />
      {group.stands.map((stand) => {
        const { left, top } = getStandPosition(stand);
        return (
          <text
            key={stand.id}
            x={left + STAND_SIZE / 2}
            y={top + STAND_SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={2.2}
            fontWeight={selected ? 700 : 600}
            fill={textColor}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {stand.label}
            {stand.standNumber}
          </text>
        );
      })}
    </g>
  );
};

MapStandGroup.displayName = "MapStandGroup";
export default memo(MapStandGroup);

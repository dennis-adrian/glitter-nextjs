"use client";

import { useRef, useState } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
  STAND_SIZE,
  getStandFillColor,
  getStandStrokeColor,
} from "../map-utils";

function clientToSvgCoords(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const svgPoint = point.matrixTransform(ctm.inverse());
  return { x: svgPoint.x, y: svgPoint.y };
}

type DraggableMapStandProps = {
  stand: StandWithReservationsWithParticipants;
  left: number;
  top: number;
  isSelected: boolean;
  isFocused: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onDragStart: (standId: number) => void;
  onDrag: (standId: number, newLeft: number, newTop: number) => void;
  onDragEnd: () => void;
  onSelect: (standId: number) => void;
  onFocus: (standId: number) => void;
};

export default function DraggableMapStand({
  stand,
  left,
  top,
  isSelected,
  isFocused,
  svgRef,
  onDragStart,
  onDrag,
  onDragEnd,
  onSelect,
  onFocus,
}: DraggableMapStandProps) {
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent<SVGGElement>) {
    e.stopPropagation();

    if (e.shiftKey) {
      onSelect(stand.id);
      return;
    }

    (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
    if (!svgRef.current) return;
    const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
    dragOffsetRef.current = { x: svgCoords.x - left, y: svgCoords.y - top };
    movedRef.current = false;
    setDragging(true);
    onDragStart(stand.id);
  }

  function handlePointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!dragging || !svgRef.current) return;
    movedRef.current = true;
    const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
    const newLeft = svgCoords.x - dragOffsetRef.current.x;
    const newTop = svgCoords.y - dragOffsetRef.current.y;
    onDrag(stand.id, newLeft, newTop);
  }

  function handlePointerUp(e: React.PointerEvent<SVGGElement>) {
    if (!dragging) return;
    (e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
    setDragging(false);
    onDragEnd();

    if (!movedRef.current) {
      onFocus(stand.id);
    }
  }

  const fillColor = dragging
    ? "rgba(59, 130, 246, 0.3)"
    : stand.status === "available"
      ? "rgba(254, 243, 199, 0.35)" // amber-100/35
      : getStandFillColor(stand.status, false);

  let strokeColor: string;
  let strokeWidth: number;
  let strokeDasharray: string | undefined;

  if (dragging) {
    strokeColor = "rgba(59, 130, 246, 0.8)";
    strokeWidth = 0.3;
    strokeDasharray = undefined;
  } else if (isFocused) {
    strokeColor = "rgba(34, 197, 94, 0.8)";
    strokeWidth = 0.35;
    strokeDasharray = undefined;
  } else if (isSelected) {
    strokeColor = "rgba(59, 130, 246, 0.8)";
    strokeWidth = 0.3;
    strokeDasharray = "0.6,0.4";
  } else {
    strokeColor = stand.status === "available"
      ? "rgba(217, 119, 6, 0.4)" // amber-600
      : getStandStrokeColor(stand.status, false);
    strokeWidth = 0.2;
    strokeDasharray = undefined;
  }

  const showCoords = dragging || isFocused;

  return (
    <g
      transform={`translate(${left}, ${top})`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <rect
        width={STAND_SIZE}
        height={STAND_SIZE}
        rx={0.4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{ transition: dragging ? "none" : "fill 150ms ease" }}
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
        {stand.label}
        {stand.standNumber}
      </text>
      {showCoords && (
        <text
          x={STAND_SIZE / 2}
          y={STAND_SIZE + 1.5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={1.4}
          fill="#6b7280"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          ({Math.round(left * 10) / 10}, {Math.round(top * 10) / 10})
        </text>
      )}
    </g>
  );
}

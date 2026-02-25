"use client";

import { forwardRef, memo, useRef, useState } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	STAND_SIZE,
	getStandPosition,
	getStandFillColor,
	getStandHoverFillColor,
	getStandStrokeColor,
	getStandTextColor,
	SELECTED_FILL,
	SELECTED_STROKE,
	SELECTED_TEXT,
	SELECTED_RING,
} from "./map-utils";
import type { StandColors } from "./map-utils";

type MapStandProps = {
	stand: StandWithReservationsWithParticipants;
	canBeReserved: boolean;
	selected?: boolean;
	colors?: StandColors;
	onClick?: (stand: StandWithReservationsWithParticipants) => void;
	onTouchTap?: (
		stand: StandWithReservationsWithParticipants,
		rect?: DOMRect,
	) => void;
	onHoverChange?: (
		stand: StandWithReservationsWithParticipants | null,
		rect: DOMRect | null,
	) => void;
};

const RING_PADDING = 0.8;
const CORNER_RADIUS = 0.8;

const MapStand = forwardRef<SVGGElement, MapStandProps>(
	(
		{
			stand,
			canBeReserved,
			selected,
			colors,
			onClick,
			onTouchTap,
			onHoverChange,
		},
		ref,
	) => {
		const [hovered, setHovered] = useState(false);
		const gRef = useRef<SVGGElement>(null);
		const touchStartPos = useRef<{ x: number; y: number } | null>(null);
		const { left, top } = getStandPosition(stand);
		const { standNumber, status } = stand;

		const fillColor = selected
			? SELECTED_FILL
			: colors
				? hovered
					? colors.hoverFill
					: colors.fill
				: hovered
					? getStandHoverFillColor(status, canBeReserved)
					: getStandFillColor(status, canBeReserved);
		const strokeColor = selected
			? SELECTED_STROKE
			: (colors?.stroke ?? getStandStrokeColor(status, canBeReserved));
		const textColor = selected
			? SELECTED_TEXT
			: (colors?.text ?? getStandTextColor(status, canBeReserved));

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
						onTouchTap?.(stand, gRef.current?.getBoundingClientRect());
					}
				}
			} else {
				onClick?.(stand);
			}
		};

		return (
			<g
				ref={(node) => {
					(gRef as React.MutableRefObject<SVGGElement | null>).current = node;
					if (typeof ref === "function") ref(node);
					else if (ref)
						(ref as React.MutableRefObject<SVGGElement | null>).current = node;
				}}
				transform={`translate(${left}, ${top})`}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerEnter={(e) => {
					if (e.pointerType !== "mouse") return;
					setHovered(true);
					if (onHoverChange && gRef.current) {
						onHoverChange(stand, gRef.current.getBoundingClientRect());
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
				}}
				role={onClick ? "button" : undefined}
				aria-label={`Espacio ${stand.label || ""}${standNumber} - ${status}`}
				tabIndex={onClick ? 0 : undefined}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick?.(stand);
					}
				}}
			>
				{/* Outer ring when selected */}
				{selected && (
					<rect
						x={-RING_PADDING}
						y={-RING_PADDING}
						width={STAND_SIZE + RING_PADDING * 2}
						height={STAND_SIZE + RING_PADDING * 2}
						rx={CORNER_RADIUS + RING_PADDING * 0.5}
						fill={SELECTED_RING}
						style={{ pointerEvents: "none" }}
					/>
				)}
				<rect
					width={STAND_SIZE}
					height={STAND_SIZE}
					rx={CORNER_RADIUS}
					fill={fillColor}
					stroke={strokeColor}
					strokeWidth={selected ? 0.3 : 0.4}
					style={{ transition: "fill 150ms ease" }}
				/>
				<text
					x={STAND_SIZE / 2}
					y={STAND_SIZE / 2}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={2.2}
					fontWeight={selected ? 700 : 600}
					fill={textColor}
					style={{ pointerEvents: "none", userSelect: "none" }}
				>
					{stand.label}
					{standNumber}
				</text>
			</g>
		);
	},
);

MapStand.displayName = "MapStand";
export default memo(MapStand);

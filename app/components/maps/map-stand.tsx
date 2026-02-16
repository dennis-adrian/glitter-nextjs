"use client";

import { forwardRef, useRef, useState } from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	STAND_SIZE,
	getStandPosition,
	getStandFillColor,
	getStandHoverFillColor,
	getStandStrokeColor,
	getStandTextColor,
} from "./map-utils";

type MapStandProps = {
	stand: StandWithReservationsWithParticipants;
	canBeReserved: boolean;
	onClick?: (stand: StandWithReservationsWithParticipants) => void;
	onTouchTap?: (stand: StandWithReservationsWithParticipants) => void;
	onHoverChange?: (
		stand: StandWithReservationsWithParticipants | null,
		rect: DOMRect | null,
	) => void;
};

const MapStand = forwardRef<SVGGElement, MapStandProps>(
	({ stand, canBeReserved, onClick, onTouchTap, onHoverChange }, ref) => {
		const [hovered, setHovered] = useState(false);
		const gRef = useRef<SVGGElement>(null);
		const { left, top } = getStandPosition(stand);
		const { standNumber, status } = stand;

		const fillColor = hovered
			? getStandHoverFillColor(status, canBeReserved)
			: getStandFillColor(status, canBeReserved);
		const strokeColor = getStandStrokeColor(status, canBeReserved);
		const textColor = getStandTextColor(status, canBeReserved);

		const handlePointerUp = (e: React.PointerEvent) => {
			if (e.pointerType === "touch" || e.pointerType === "pen") {
				onTouchTap?.(stand);
			} else {
				if (!canBeReserved || !onClick) return;
				onClick(stand);
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
				onPointerUp={handlePointerUp}
				onMouseEnter={() => {
					setHovered(true);
					if (onHoverChange && gRef.current) {
						onHoverChange(stand, gRef.current.getBoundingClientRect());
					}
				}}
				onMouseLeave={() => {
					setHovered(false);
					onHoverChange?.(null, null);
				}}
				style={{ cursor: canBeReserved ? "pointer" : "default" }}
				role={canBeReserved ? "button" : undefined}
				aria-label={`Espacio ${stand.label || ""}${standNumber} - ${status}`}
				tabIndex={canBeReserved ? 0 : undefined}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						if (canBeReserved && onClick) onClick(stand);
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
export default MapStand;

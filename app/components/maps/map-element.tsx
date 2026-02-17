"use client";

import {
	MapElementBase,
	MAP_ELEMENT_TYPES,
} from "@/app/lib/map_elements/definitions";
import MapElementIcon from "./map-element-icon";
import { getLabelLayout } from "./map-element-label-utils";

type MapElementProps = {
	element: MapElementBase;
};

export default function MapElement({ element }: MapElementProps) {
	const config = MAP_ELEMENT_TYPES[element.type];
	const { positionLeft: left, positionTop: top, width, height } = element;
	const displayLabel = element.label || config.defaultLabel;
	const labelFontSize = element.labelFontSize ?? 2;
	const labelFontWeight = element.labelFontWeight ?? 500;
	const showIcon = element.showIcon !== false;
	const rotation = element.rotation ?? 0;

	const iconSize = Math.min(width, height) * 0.5;

	// Label color: use stroke at full opacity for solid elements, darker for label type
	const labelColor =
		element.type === "label"
			? "#374151"
			: config.strokeColor.replace(/[\d.]+\)$/, "1)");

	return (
		<g transform={`translate(${left}, ${top})`}>
			{/* Shape */}
			<rect
				width={width}
				height={height}
				rx={0.6}
				fill={config.fillColor}
				stroke={config.strokeColor}
				strokeWidth={0.2}
			/>
			{/* Icon — white for contrast on solid backgrounds, rotated */}
			{showIcon && (
				<g transform={rotation ? `rotate(${rotation}, ${width / 2}, ${height / 2})` : undefined}>
					<MapElementIcon
						type={element.type}
						cx={width / 2}
						cy={height / 2}
						size={iconSize}
						color={element.type === "label" ? "#374151" : "#ffffff"}
					/>
				</g>
			)}
			{/* Label with white background */}
			{displayLabel && (() => {
				const fs = Math.min(Math.max(labelFontSize, 0.5), 6);
				const fw = Math.min(900, Math.max(100, labelFontWeight));
				const estTextWidth = displayLabel.length * fs * 0.55;
				const padX = fs * 0.4;
				const padY = fs * 0.25;
				const layout = getLabelLayout(element.labelPosition, width, height, fs, estTextWidth, padX);
				return (
					<>
						<rect
							x={layout.bgX - padX}
							y={layout.bgY - padY}
							width={estTextWidth + padX * 2}
							height={fs + padY * 2}
							rx={fs * 0.35}
							fill="white"
							opacity={0.85}
							style={{ pointerEvents: "none" }}
						/>
						<text
							x={layout.textX}
							y={layout.textY}
							textAnchor={layout.textAnchor}
							dominantBaseline="central"
							fontSize={fs}
							fontWeight={fw}
							fill={labelColor}
							style={{ pointerEvents: "none", userSelect: "none", textTransform: "uppercase" as const }}
						>
							{displayLabel}
						</text>
					</>
				);
			})()}
		</g>
	);
}

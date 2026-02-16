"use client";

import { useRef, useState } from "react";
import {
	MapElementBase,
	MAP_ELEMENT_TYPES,
} from "@/app/lib/map_elements/definitions";
import MapElementIcon from "../map-element-icon";
import { getLabelLayout } from "../map-element-label-utils";

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

type ResizeHandle = "nw" | "ne" | "sw" | "se";

type DraggableMapElementProps = {
	element: MapElementBase;
	left: number;
	top: number;
	width: number;
	height: number;
	isSelected: boolean;
	isFocused: boolean;
	svgRef: React.RefObject<SVGSVGElement | null>;
	onDragStart: (elementId: number) => void;
	onDrag: (elementId: number, newLeft: number, newTop: number) => void;
	onDragEnd: () => void;
	onSelect: (elementId: number) => void;
	onFocus: (elementId: number) => void;
	onResize: (
		elementId: number,
		newLeft: number,
		newTop: number,
		newWidth: number,
		newHeight: number,
	) => void;
	onResizeStart?: () => void;
	onResizeEnd: () => void;
};

const MIN_SIZE = 3;

export default function DraggableMapElement({
	element,
	left,
	top,
	width,
	height,
	isSelected,
	isFocused,
	svgRef,
	onDragStart,
	onDrag,
	onDragEnd,
	onSelect,
	onFocus,
	onResize,
	onResizeStart,
	onResizeEnd,
}: DraggableMapElementProps) {
	const [dragging, setDragging] = useState(false);
	const [resizing, setResizing] = useState<ResizeHandle | null>(null);
	const dragOffsetRef = useRef({ x: 0, y: 0 });
	const movedRef = useRef(false);
	const resizeStartRef = useRef({ left, top, width, height, x: 0, y: 0 });

	const config = MAP_ELEMENT_TYPES[element.type];
	const displayLabel = element.label || config.defaultLabel;
	const labelFontSize = element.labelFontSize ?? 2;
	const labelFontWeight = element.labelFontWeight ?? 500;
	const showIcon = element.showIcon !== false;
	const rotation = element.rotation ?? 0;

	// --- Drag handlers ---
	function handlePointerDown(e: React.PointerEvent<SVGGElement>) {
		e.stopPropagation();

		if (e.shiftKey) {
			onSelect(element.id);
			return;
		}

		(e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
		if (!svgRef.current) return;
		const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
		dragOffsetRef.current = { x: svgCoords.x - left, y: svgCoords.y - top };
		movedRef.current = false;
		setDragging(true);
		onDragStart(element.id);
	}

	function handlePointerMove(e: React.PointerEvent<SVGGElement>) {
		if (!dragging || !svgRef.current) return;
		movedRef.current = true;
		const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
		const newLeft = svgCoords.x - dragOffsetRef.current.x;
		const newTop = svgCoords.y - dragOffsetRef.current.y;
		onDrag(element.id, newLeft, newTop);
	}

	function handlePointerUp(e: React.PointerEvent<SVGGElement>) {
		if (!dragging) return;
		(e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
		setDragging(false);
		onDragEnd();

		if (!movedRef.current) {
			onFocus(element.id);
		}
	}

	function handlePointerCancel(e: React.PointerEvent<SVGGElement>) {
		if (!dragging) return;
		(e.currentTarget as SVGGElement).releasePointerCapture(e.pointerId);
		setDragging(false);
		onDragEnd();
	}

	// --- Resize handlers ---
	function handleResizePointerDown(
		e: React.PointerEvent<SVGRectElement>,
		handle: ResizeHandle,
	) {
		e.stopPropagation();
		(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
		if (!svgRef.current) return;
		const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
		resizeStartRef.current = {
			left,
			top,
			width,
			height,
			x: svgCoords.x,
			y: svgCoords.y,
		};
		setResizing(handle);
		onResizeStart?.();
	}

	function handleResizePointerMove(e: React.PointerEvent<SVGRectElement>) {
		if (!resizing || !svgRef.current) return;
		const svgCoords = clientToSvgCoords(svgRef.current, e.clientX, e.clientY);
		const start = resizeStartRef.current;
		const dx = svgCoords.x - start.x;
		const dy = svgCoords.y - start.y;

		let newLeft = start.left;
		let newTop = start.top;
		let newWidth = start.width;
		let newHeight = start.height;

		if (resizing === "nw" || resizing === "sw") {
			newWidth = Math.max(MIN_SIZE, start.width - dx);
			newLeft = start.left + (start.width - newWidth);
		} else {
			newWidth = Math.max(MIN_SIZE, start.width + dx);
		}

		if (resizing === "nw" || resizing === "ne") {
			newHeight = Math.max(MIN_SIZE, start.height - dy);
			newTop = start.top + (start.height - newHeight);
		} else {
			newHeight = Math.max(MIN_SIZE, start.height + dy);
		}

		onResize(element.id, newLeft, newTop, newWidth, newHeight);
	}

	function handleResizePointerUp(e: React.PointerEvent<SVGRectElement>) {
		if (!resizing) return;
		(e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
		setResizing(null);
		onResizeEnd();
	}

	// --- Visual styles ---
	let fillColor: string;
	let strokeColor: string;
	let strokeWidth: number;

	if (dragging || resizing) {
		fillColor = "rgba(59, 130, 246, 0.15)";
		strokeColor = "rgba(59, 130, 246, 0.8)";
		strokeWidth = 0.3;
	} else if (isFocused) {
		fillColor = config.fillColor;
		strokeColor = "rgba(34, 197, 94, 0.8)";
		strokeWidth = 0.35;
	} else if (isSelected) {
		fillColor = config.fillColor;
		strokeColor = "rgba(59, 130, 246, 0.8)";
		strokeWidth = 0.3;
	} else {
		fillColor = config.fillColor;
		strokeColor = config.strokeColor;
		strokeWidth = 0.2;
	}

	const iconSize = Math.min(width, height) * 0.5;
	const showCoords = dragging || isFocused;
	const handleSize = Math.max(Math.min(width, height) * 0.15, 1);
	const showResizeHandles = isFocused && !dragging;
	const labelPosition = element.labelPosition ?? "bottom";

	return (
		<g transform={`translate(${left}, ${top})`}>
			{/* Main body — drag target */}
			<g
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
				onLostPointerCapture={handlePointerCancel}
				style={{
					cursor: dragging ? "grabbing" : "grab",
					touchAction: "none",
				}}
			>
				<rect
					width={width}
					height={height}
					rx={0.6}
					fill={fillColor}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					style={{
						transition: dragging ? "none" : "fill 150ms ease",
					}}
				/>
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
			</g>

			{/* Label with white background */}
			{displayLabel && (() => {
				const fs = Math.min(Math.max(labelFontSize, 0.5), 6);
				const fw = Math.min(900, Math.max(100, labelFontWeight));
				const estTextWidth = displayLabel.length * fs * 0.55;
				const padX = fs * 0.4;
				const padY = fs * 0.25;
				const labelColor =
					element.type === "label"
						? "#374151"
						: config.strokeColor.replace(/[\d.]+\)$/, "1)");
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

			{/* Coordinates */}
			{showCoords && (
				<text
					x={width / 2}
					y={
						height +
						(displayLabel && labelPosition === "bottom" ? labelFontSize + 0.5 + 2 : 0) +
						1.5
					}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize={1.4}
					fill="#6b7280"
					style={{ pointerEvents: "none", userSelect: "none" }}
				>
					({Math.round(left * 10) / 10}, {Math.round(top * 10) / 10}){" "}
					{Math.round(width * 10) / 10}×{Math.round(height * 10) / 10}
				</text>
			)}

			{/* Resize handles */}
			{showResizeHandles && (
				<>
					{(["nw", "ne", "sw", "se"] as const).map((handle) => {
						const hx =
							handle === "nw" || handle === "sw"
								? -handleSize / 2
								: width - handleSize / 2;
						const hy =
							handle === "nw" || handle === "ne"
								? -handleSize / 2
								: height - handleSize / 2;
						const cursor =
							handle === "nw" || handle === "se"
								? "nwse-resize"
								: "nesw-resize";

						return (
							<rect
								key={handle}
								x={hx}
								y={hy}
								width={handleSize}
								height={handleSize}
								rx={handleSize * 0.15}
								fill="white"
								stroke="rgba(59, 130, 246, 0.8)"
								strokeWidth={0.2}
								style={{ cursor, touchAction: "none" }}
								onPointerDown={(e) => handleResizePointerDown(e, handle)}
								onPointerMove={handleResizePointerMove}
								onPointerUp={handleResizePointerUp}
								onPointerCancel={handleResizePointerUp}
								onLostPointerCapture={handleResizePointerUp}
							/>
						);
					})}
				</>
			)}
		</g>
	);
}

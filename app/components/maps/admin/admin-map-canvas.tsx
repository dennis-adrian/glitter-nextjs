"use client";

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import MapCanvas from "@/app/components/maps/map-canvas";
import DraggableMapStand from "./draggable-map-stand";
import DraggableMapElement from "./draggable-map-element";
import { STAND_SIZE } from "../map-utils";

export type GuideLine = {
	axis: "horizontal" | "vertical";
	position: number;
};

export type MapBounds = {
	minX: number;
	minY: number;
	width: number;
	height: number;
};

type AdminMapCanvasProps = {
	stands: StandWithReservationsWithParticipants[];
	positions: Map<number, { left: number; top: number }>;
	selectedStands: Set<number>;
	snapToGrid: boolean;
	gridSize: number;
	showGrid: boolean;
	showGuides: boolean;
	focusedStandId: number | null;
	initialBounds: MapBounds | null;
	onPositionChange: (standId: number, left: number, top: number) => void;
	onDragStart: (standId: number) => void;
	onDragEnd: () => void;
	onSelect: (standId: number) => void;
	onFocus: (standId: number) => void;
	onBoundsChange: (bounds: MapBounds) => void;
	onDeselectAll: () => void;
	onResizeStart: () => void;
	onResizeEnd: () => void;
	// Map elements
	elements: MapElementBase[];
	elementPositions: Map<number, { left: number; top: number }>;
	elementSizes: Map<number, { width: number; height: number }>;
	selectedElements: Set<number>;
	focusedElementId: number | null;
	onElementPositionChange: (
		elementId: number,
		left: number,
		top: number,
	) => void;
	onElementDragStart: (elementId: number) => void;
	onElementDragEnd: () => void;
	onElementSelect: (elementId: number) => void;
	onElementFocus: (elementId: number) => void;
	onElementResize: (
		elementId: number,
		left: number,
		top: number,
		width: number,
		height: number,
	) => void;
	onElementResizeStart?: () => void;
	onElementResizeEnd: () => void;
};

export type AdminMapCanvasHandle = {
	resetBounds: (bounds: MapBounds | null) => void;
};

function computeBoundsFromPositions(
	positions: Map<number, { left: number; top: number }>,
	elementPositions?: Map<number, { left: number; top: number }>,
	elementSizes?: Map<number, { width: number; height: number }>,
) {
	const hasElements = elementPositions && elementPositions.size > 0;
	if (positions.size === 0 && !hasElements) {
		return { minX: 0, minY: 0, width: 50, height: 50 };
	}

	let minLeft = Infinity;
	let minTop = Infinity;
	let maxRight = -Infinity;
	let maxBottom = -Infinity;

	for (const { left, top } of positions.values()) {
		minLeft = Math.min(minLeft, left);
		minTop = Math.min(minTop, top);
		maxRight = Math.max(maxRight, left + STAND_SIZE);
		maxBottom = Math.max(maxBottom, top + STAND_SIZE);
	}

	if (elementPositions && elementSizes) {
		for (const [id, { left, top }] of elementPositions.entries()) {
			const size = elementSizes.get(id);
			if (!size) continue;
			minLeft = Math.min(minLeft, left);
			minTop = Math.min(minTop, top);
			maxRight = Math.max(maxRight, left + size.width);
			maxBottom = Math.max(maxBottom, top + size.height);
		}
	}

	const padding = 4;
	return {
		minX: minLeft - padding,
		minY: minTop - padding,
		width: maxRight - minLeft + 2 * padding,
		height: maxBottom - minTop + 2 * padding,
	};
}

const GUIDE_THRESHOLD = 0.5;

type SnapItem = {
	left: number;
	top: number;
	width: number;
	height: number;
};

function computeSnappedPosition(
	draggedWidth: number,
	draggedHeight: number,
	rawLeft: number,
	rawTop: number,
	snapItems: SnapItem[],
	snapToGrid: boolean,
	gridSize: number,
	showGuides: boolean,
): { left: number; top: number; guides: GuideLine[] } {
	let left = rawLeft;
	let top = rawTop;

	// Step 1: Grid snapping
	if (snapToGrid && gridSize > 0) {
		left = Math.round(left / gridSize) * gridSize;
		top = Math.round(top / gridSize) * gridSize;
	}

	const guides: GuideLine[] = [];

	if (!showGuides) {
		return { left, top, guides };
	}

	// Step 2: Smart guide snapping (overrides grid if within threshold)
	const draggedCenter = {
		x: left + draggedWidth / 2,
		y: top + draggedHeight / 2,
	};
	const draggedRight = left + draggedWidth;
	const draggedBottom = top + draggedHeight;

	let bestSnapX: { distance: number; snapTo: number; guidePos: number } | null =
		null;
	let bestSnapY: { distance: number; snapTo: number; guidePos: number } | null =
		null;

	for (const item of snapItems) {
		const otherCenter = {
			x: item.left + item.width / 2,
			y: item.top + item.height / 2,
		};
		const otherRight = item.left + item.width;
		const otherBottom = item.top + item.height;

		// Vertical guides (matching X positions)
		const xChecks = [
			{ dragVal: left, otherVal: item.left, guidePos: item.left }, // left-left
			{ dragVal: draggedRight, otherVal: otherRight, guidePos: otherRight }, // right-right
			{
				dragVal: draggedCenter.x,
				otherVal: otherCenter.x,
				guidePos: otherCenter.x,
			}, // center-center
			{ dragVal: left, otherVal: otherRight, guidePos: otherRight }, // left-right
			{ dragVal: draggedRight, otherVal: item.left, guidePos: item.left }, // right-left
		];

		for (const check of xChecks) {
			const distance = Math.abs(check.dragVal - check.otherVal);
			if (distance < GUIDE_THRESHOLD) {
				if (!bestSnapX || distance < bestSnapX.distance) {
					const offset = check.dragVal - left;
					bestSnapX = {
						distance,
						snapTo: check.otherVal - offset,
						guidePos: check.guidePos,
					};
				}
			}
		}

		// Horizontal guides (matching Y positions)
		const yChecks = [
			{ dragVal: top, otherVal: item.top, guidePos: item.top }, // top-top
			{ dragVal: draggedBottom, otherVal: otherBottom, guidePos: otherBottom }, // bottom-bottom
			{
				dragVal: draggedCenter.y,
				otherVal: otherCenter.y,
				guidePos: otherCenter.y,
			}, // center-center
			{ dragVal: top, otherVal: otherBottom, guidePos: otherBottom }, // top-bottom
			{ dragVal: draggedBottom, otherVal: item.top, guidePos: item.top }, // bottom-top
		];

		for (const check of yChecks) {
			const distance = Math.abs(check.dragVal - check.otherVal);
			if (distance < GUIDE_THRESHOLD) {
				if (!bestSnapY || distance < bestSnapY.distance) {
					const offset = check.dragVal - top;
					bestSnapY = {
						distance,
						snapTo: check.otherVal - offset,
						guidePos: check.guidePos,
					};
				}
			}
		}
	}

	if (bestSnapX) {
		left = bestSnapX.snapTo;
		guides.push({ axis: "vertical", position: bestSnapX.guidePos });
	}
	if (bestSnapY) {
		top = bestSnapY.snapTo;
		guides.push({ axis: "horizontal", position: bestSnapY.guidePos });
	}

	return { left, top, guides };
}

type Edge = "left" | "right" | "top" | "bottom";

const AdminMapCanvas = forwardRef<AdminMapCanvasHandle, AdminMapCanvasProps>(
	function AdminMapCanvas(
		{
			stands,
			positions,
			selectedStands,
			snapToGrid,
			gridSize,
			showGrid,
			showGuides,
			focusedStandId,
			initialBounds,
			onPositionChange,
			onDragStart,
			onDragEnd,
			onSelect,
			onFocus,
			onBoundsChange,
			onDeselectAll,
			onResizeStart,
			onResizeEnd,
			elements,
			elementPositions,
			elementSizes,
			selectedElements,
			focusedElementId,
			onElementPositionChange,
			onElementDragStart,
			onElementDragEnd,
			onElementSelect,
			onElementFocus,
			onElementResize,
			onElementResizeStart,
			onElementResizeEnd,
		},
		ref,
	) {
		const svgRef = useRef<SVGSVGElement>(null);
		const resizeCleanupRef = useRef<(() => void) | null>(null);
		const onBoundsChangeRef = useRef(onBoundsChange);
		const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);
		const [mapBounds, setMapBounds] = useState<MapBounds>(
			() =>
				initialBounds ??
				computeBoundsFromPositions(positions, elementPositions, elementSizes),
		);
		const [hoveredEdge, setHoveredEdge] = useState<Edge | "corner" | null>(
			null,
		);

		// Cleanup resize listeners on unmount
		useEffect(() => {
			return () => {
				resizeCleanupRef.current?.();
			};
		}, []);

		useImperativeHandle(
			ref,
			() => ({
				resetBounds: (bounds: MapBounds | null) => {
					const newBounds =
						bounds ??
						computeBoundsFromPositions(
							positions,
							elementPositions,
							elementSizes,
						);
					setMapBounds(newBounds);
				},
			}),
			[positions, elementPositions, elementSizes],
		);

		// Keep ref updated (React 19 compliant - via effect, not during render)
		useEffect(() => {
			onBoundsChangeRef.current = onBoundsChange;
		});

		// Notify parent when bounds change (only depends on mapBounds)
		useEffect(() => {
			onBoundsChangeRef.current(mapBounds);
		}, [mapBounds]);

		const bounds = mapBounds;

		// Handle thickness in SVG units (scales with viewBox)
		const handleSize = Math.max(bounds.width, bounds.height) * 0.015;

		function startEdgeResize(
			edges: Edge[],
			e: React.PointerEvent<SVGRectElement>,
		) {
			e.stopPropagation();

			// Validate before starting resize to avoid stuck state
			const svg = svgRef.current;
			if (!svg) return;
			const ctm = svg.getScreenCTM();
			if (!ctm) return;

			// Now safe to start resize
			onResizeStart();
			const el = e.currentTarget;
			const pointerId = e.pointerId;
			el.setPointerCapture(pointerId);

			const ctmInverse = ctm.inverse();
			const startPt = svg.createSVGPoint();
			startPt.x = e.clientX;
			startPt.y = e.clientY;
			const svgStart = startPt.matrixTransform(ctmInverse);
			const startBounds = { ...mapBounds };

			const onMove = (ev: PointerEvent) => {
				const pt = svg.createSVGPoint();
				pt.x = ev.clientX;
				pt.y = ev.clientY;
				const svgPos = pt.matrixTransform(ctmInverse);
				const dx = svgPos.x - svgStart.x;
				const dy = svgPos.y - svgStart.y;

				let { minX, minY, width, height } = startBounds;
				const right = minX + width;
				const bottom = minY + height;

				for (const edge of edges) {
					if (edge === "left") {
						const newMinX = startBounds.minX + dx;
						minX = Math.min(newMinX, right - STAND_SIZE);
						width = right - minX;
					}
					if (edge === "right") {
						width = Math.max(STAND_SIZE, startBounds.width + dx);
					}
					if (edge === "top") {
						const newMinY = startBounds.minY + dy;
						minY = Math.min(newMinY, bottom - STAND_SIZE);
						height = bottom - minY;
					}
					if (edge === "bottom") {
						height = Math.max(STAND_SIZE, startBounds.height + dy);
					}
				}

				setMapBounds({ minX, minY, width, height });
			};

			const cleanup = () => {
				el.removeEventListener("pointermove", onMove);
				el.removeEventListener("pointerup", onUp);
				el.removeEventListener("pointercancel", onUp);
				try {
					el.releasePointerCapture(pointerId);
				} catch {
					// Pointer capture may already be released
				}
				resizeCleanupRef.current = null;
			};

			const onUp = () => {
				cleanup();
				onResizeEnd();
			};

			resizeCleanupRef.current = cleanup;
			el.addEventListener("pointermove", onMove);
			el.addEventListener("pointerup", onUp);
			el.addEventListener("pointercancel", onUp);
		}

		// Build snap items from both stands and elements, excluding given IDs
		const buildSnapItems = useCallback(
			(
				excludeStandIds: Set<number>,
				excludeElementIds: Set<number>,
			): SnapItem[] => {
				const items: SnapItem[] = [];
				for (const [id, pos] of positions.entries()) {
					if (excludeStandIds.has(id)) continue;
					items.push({
						left: pos.left,
						top: pos.top,
						width: STAND_SIZE,
						height: STAND_SIZE,
					});
				}
				for (const [id, pos] of elementPositions.entries()) {
					if (excludeElementIds.has(id)) continue;
					const size = elementSizes.get(id);
					if (!size) continue;
					items.push({
						left: pos.left,
						top: pos.top,
						width: size.width,
						height: size.height,
					});
				}
				return items;
			},
			[positions, elementPositions, elementSizes],
		);

		const handleDrag = useCallback(
			(standId: number, rawLeft: number, rawTop: number) => {
				const isMultiDrag =
					selectedStands.has(standId) && selectedStands.size >= 2;

				const excludeStandIds = isMultiDrag
					? selectedStands
					: new Set([standId]);
				const snapItems = buildSnapItems(excludeStandIds, new Set());

				const result = computeSnappedPosition(
					STAND_SIZE,
					STAND_SIZE,
					rawLeft,
					rawTop,
					snapItems,
					snapToGrid,
					gridSize,
					showGuides,
				);
				setActiveGuides(result.guides);

				if (isMultiDrag) {
					const oldPos = positions.get(standId);
					if (!oldPos) return;
					const dx = result.left - oldPos.left;
					const dy = result.top - oldPos.top;

					for (const id of selectedStands) {
						const pos = positions.get(id);
						if (!pos) continue;
						onPositionChange(id, pos.left + dx, pos.top + dy);
					}
				} else {
					onPositionChange(standId, result.left, result.top);
				}
			},
			[
				positions,
				selectedStands,
				snapToGrid,
				gridSize,
				showGuides,
				onPositionChange,
				buildSnapItems,
			],
		);

		const handleElementDrag = useCallback(
			(elementId: number, rawLeft: number, rawTop: number) => {
				const isMultiDrag =
					selectedElements.has(elementId) && selectedElements.size >= 2;

				const excludeElementIds = isMultiDrag
					? selectedElements
					: new Set([elementId]);
				const snapItems = buildSnapItems(new Set(), excludeElementIds);

				const size = elementSizes.get(elementId);
				const dragW = size?.width ?? 8;
				const dragH = size?.height ?? 8;

				const result = computeSnappedPosition(
					dragW,
					dragH,
					rawLeft,
					rawTop,
					snapItems,
					snapToGrid,
					gridSize,
					showGuides,
				);
				setActiveGuides(result.guides);

				if (isMultiDrag) {
					const oldPos = elementPositions.get(elementId);
					if (!oldPos) return;
					const dx = result.left - oldPos.left;
					const dy = result.top - oldPos.top;

					for (const id of selectedElements) {
						const pos = elementPositions.get(id);
						if (!pos) continue;
						onElementPositionChange(id, pos.left + dx, pos.top + dy);
					}
				} else {
					onElementPositionChange(elementId, result.left, result.top);
				}
			},
			[
				elementPositions,
				elementSizes,
				selectedElements,
				snapToGrid,
				gridSize,
				showGuides,
				onElementPositionChange,
				buildSnapItems,
			],
		);

		const handleDragEnd = useCallback(() => {
			setActiveGuides([]);
			onDragEnd();
		}, [onDragEnd]);

		const handleElementDragEndCb = useCallback(() => {
			setActiveGuides([]);
			onElementDragEnd();
		}, [onElementDragEnd]);

		// Grid lines
		const gridLines: React.ReactNode[] = [];
		if (showGrid && gridSize > 0) {
			const startX = Math.ceil(bounds.minX / gridSize) * gridSize;
			const endX = bounds.minX + bounds.width;
			const startY = Math.ceil(bounds.minY / gridSize) * gridSize;
			const endY = bounds.minY + bounds.height;

			for (let x = startX; x <= endX; x += gridSize) {
				gridLines.push(
					<line
						key={`gx-${x}`}
						x1={x}
						y1={bounds.minY}
						x2={x}
						y2={endY}
						stroke="#d1d5db"
						strokeWidth={0.1}
						strokeDasharray="0.5,0.5"
						style={{ pointerEvents: "none" }}
					/>,
				);
			}
			for (let y = startY; y <= endY; y += gridSize) {
				gridLines.push(
					<line
						key={`gy-${y}`}
						x1={bounds.minX}
						y1={y}
						x2={endX}
						y2={y}
						stroke="#d1d5db"
						strokeWidth={0.1}
						strokeDasharray="0.5,0.5"
						style={{ pointerEvents: "none" }}
					/>,
				);
			}
		}

		return (
			<MapCanvas
				ref={svgRef}
				className="w-full h-full"
				config={{
					minX: bounds.minX,
					minY: bounds.minY,
					width: bounds.width,
					height: bounds.height,
				}}
			>
				<rect
					x={bounds.minX}
					y={bounds.minY}
					width={bounds.width}
					height={bounds.height}
					fill="transparent"
					onPointerDown={onDeselectAll}
				/>
				{gridLines}
				{/* Elements render behind stands */}
				{elements.map((element) => {
					const pos = elementPositions.get(element.id);
					if (!pos) return null;
					const size = elementSizes.get(element.id);

					return (
						<DraggableMapElement
							key={`el-${element.id}`}
							element={element}
							left={pos.left}
							top={pos.top}
							width={size?.width ?? element.width}
							height={size?.height ?? element.height}
							isSelected={selectedElements.has(element.id)}
							isFocused={element.id === focusedElementId}
							svgRef={svgRef}
							onDragStart={onElementDragStart}
							onDrag={handleElementDrag}
							onDragEnd={handleElementDragEndCb}
							onSelect={onElementSelect}
							onFocus={onElementFocus}
							onResize={onElementResize}
							onResizeStart={onElementResizeStart}
							onResizeEnd={onElementResizeEnd}
						/>
					);
				})}
				{stands.map((stand) => {
					const pos = positions.get(stand.id);
					if (!pos) return null;

					return (
						<DraggableMapStand
							key={stand.id}
							stand={stand}
							left={pos.left}
							top={pos.top}
							isSelected={selectedStands.has(stand.id)}
							isFocused={stand.id === focusedStandId}
							svgRef={svgRef}
							onDragStart={onDragStart}
							onDrag={handleDrag}
							onDragEnd={handleDragEnd}
							onSelect={onSelect}
							onFocus={onFocus}
						/>
					);
				})}
				{activeGuides.map((guide, i) => {
					if (guide.axis === "vertical") {
						return (
							<line
								key={`guide-${i}`}
								x1={guide.position}
								y1={bounds.minY}
								x2={guide.position}
								y2={bounds.minY + bounds.height}
								stroke="rgba(59, 130, 246, 0.6)"
								strokeWidth={0.15}
								strokeDasharray="0.8,0.4"
								style={{ pointerEvents: "none" }}
							/>
						);
					}
					return (
						<line
							key={`guide-${i}`}
							x1={bounds.minX}
							y1={guide.position}
							x2={bounds.minX + bounds.width}
							y2={guide.position}
							stroke="rgba(59, 130, 246, 0.6)"
							strokeWidth={0.15}
							strokeDasharray="0.8,0.4"
							style={{ pointerEvents: "none" }}
						/>
					);
				})}
				{/* SVG resize handles */}
				{/* Left edge */}
				<rect
					x={bounds.minX - handleSize / 2}
					y={bounds.minY + handleSize}
					width={handleSize}
					height={bounds.height - handleSize * 2}
					fill="transparent"
					stroke={hoveredEdge === "left" ? "rgba(59, 130, 246, 0.5)" : "none"}
					strokeWidth={handleSize * 0.15}
					style={{ cursor: "ew-resize", pointerEvents: "all" }}
					onPointerDown={(e) => startEdgeResize(["left"], e)}
					onPointerEnter={() => setHoveredEdge("left")}
					onPointerLeave={() => setHoveredEdge(null)}
				/>
				{/* Right edge */}
				<rect
					x={bounds.minX + bounds.width - handleSize / 2}
					y={bounds.minY + handleSize}
					width={handleSize}
					height={bounds.height - handleSize * 2}
					fill="transparent"
					stroke={hoveredEdge === "right" ? "rgba(59, 130, 246, 0.5)" : "none"}
					strokeWidth={handleSize * 0.15}
					style={{ cursor: "ew-resize", pointerEvents: "all" }}
					onPointerDown={(e) => startEdgeResize(["right"], e)}
					onPointerEnter={() => setHoveredEdge("right")}
					onPointerLeave={() => setHoveredEdge(null)}
				/>
				{/* Top edge */}
				<rect
					x={bounds.minX + handleSize}
					y={bounds.minY - handleSize / 2}
					width={bounds.width - handleSize * 2}
					height={handleSize}
					fill="transparent"
					stroke={hoveredEdge === "top" ? "rgba(59, 130, 246, 0.5)" : "none"}
					strokeWidth={handleSize * 0.15}
					style={{ cursor: "ns-resize", pointerEvents: "all" }}
					onPointerDown={(e) => startEdgeResize(["top"], e)}
					onPointerEnter={() => setHoveredEdge("top")}
					onPointerLeave={() => setHoveredEdge(null)}
				/>
				{/* Bottom edge */}
				<rect
					x={bounds.minX + handleSize}
					y={bounds.minY + bounds.height - handleSize / 2}
					width={bounds.width - handleSize * 2}
					height={handleSize}
					fill="transparent"
					stroke={hoveredEdge === "bottom" ? "rgba(59, 130, 246, 0.5)" : "none"}
					strokeWidth={handleSize * 0.15}
					style={{ cursor: "ns-resize", pointerEvents: "all" }}
					onPointerDown={(e) => startEdgeResize(["bottom"], e)}
					onPointerEnter={() => setHoveredEdge("bottom")}
					onPointerLeave={() => setHoveredEdge(null)}
				/>
				{/* Corner handles */}
				{(
					[
						{
							edges: ["left", "top"] as Edge[],
							x: bounds.minX,
							y: bounds.minY,
							cursor: "nwse-resize",
						},
						{
							edges: ["right", "top"] as Edge[],
							x: bounds.minX + bounds.width,
							y: bounds.minY,
							cursor: "nesw-resize",
						},
						{
							edges: ["left", "bottom"] as Edge[],
							x: bounds.minX,
							y: bounds.minY + bounds.height,
							cursor: "nesw-resize",
						},
						{
							edges: ["right", "bottom"] as Edge[],
							x: bounds.minX + bounds.width,
							y: bounds.minY + bounds.height,
							cursor: "nwse-resize",
						},
					] as const
				).map(({ edges, x, y, cursor }, i) => (
					<rect
						key={`corner-${i}`}
						x={x - handleSize * 0.75}
						y={y - handleSize * 0.75}
						width={handleSize * 1.5}
						height={handleSize * 1.5}
						rx={handleSize * 0.2}
						fill={
							hoveredEdge === "corner"
								? "rgba(59, 130, 246, 0.3)"
								: "rgba(59, 130, 246, 0.15)"
						}
						stroke="rgba(59, 130, 246, 0.6)"
						strokeWidth={handleSize * 0.1}
						style={{ cursor, pointerEvents: "all" }}
						onPointerDown={(e) => startEdgeResize([...edges], e)}
						onPointerEnter={() => setHoveredEdge("corner")}
						onPointerLeave={() => setHoveredEdge(null)}
					/>
				))}
			</MapCanvas>
		);
	},
);

export default AdminMapCanvas;

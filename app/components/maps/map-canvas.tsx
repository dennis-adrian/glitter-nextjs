import { forwardRef } from "react";
import { DEFAULT_CANVAS_CONFIG } from "./map-utils";
import { MapCanvasConfig } from "./map-types";

type MapCanvasProps = {
	config?: Partial<MapCanvasConfig>;
	className?: string;
	children: React.ReactNode;
};

const MapCanvas = forwardRef<SVGSVGElement, MapCanvasProps>(
	({ config, className = "w-full h-auto", children }, ref) => {
		const canvasConfig = { ...DEFAULT_CANVAS_CONFIG, ...config };
		const { minX, minY, width, height } = canvasConfig;

		const dotSpacing = 3;
		const dotRadius = 0.35;

		return (
			<svg
				ref={ref}
				viewBox={`${minX} ${minY} ${width} ${height}`}
				preserveAspectRatio="xMidYMid meet"
				className={className}
				role="img"
				aria-label="Mapa del evento con espacios disponibles"
			>
				<defs>
					<pattern
						id="dot-grid"
						x={minX}
						y={minY}
						width={dotSpacing}
						height={dotSpacing}
						patternUnits="userSpaceOnUse"
					>
						<circle
							cx={dotSpacing / 1}
							cy={dotSpacing / 1}
							r={dotRadius}
							fill="#9CA3AF"
						/>
					</pattern>
				</defs>
				<rect
					x={minX}
					y={minY}
					width={width}
					height={height}
					rx={1}
					fill="#ffffff"
				/>
				<rect
					x={minX}
					y={minY}
					width={width}
					height={height}
					rx={1}
					fill="url(#dot-grid)"
				/>
				{children}
			</svg>
		);
	},
);

MapCanvas.displayName = "MapCanvas";
export default MapCanvas;

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
    const { minX, minY, width, height, backgroundColor } = canvasConfig;

    return (
      <svg
        ref={ref}
        viewBox={`${minX} ${minY} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        role="img"
        aria-label="Mapa del evento con espacios disponibles"
      >
        <rect
          x={minX}
          y={minY}
          width={width}
          height={height}
          rx={1}
          fill={backgroundColor}
        />
        {children}
      </svg>
    );
  },
);

MapCanvas.displayName = "MapCanvas";
export default MapCanvas;

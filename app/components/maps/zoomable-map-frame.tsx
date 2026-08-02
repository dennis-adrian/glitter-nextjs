"use client";

import { TransformComponent } from "react-zoom-pan-pinch";

import MapPinchHint from "@/app/components/maps/map-pinch-hint";
import MapTransformWrapper from "@/app/components/maps/map-transform-wrapper";

type ZoomableMapFrameProps = {
  /** Row rendered above the map, laid out with space between its children */
  header?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Bordered, zoom/pan enabled shell around a MapSurface, with the mobile pinch
 * hint. Used by the maps that share the centered 500px card layout.
 */
export default function ZoomableMapFrame({
  header,
  children,
}: ZoomableMapFrameProps) {
  return (
    <div className="flex flex-col items-center w-full">
      <MapTransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        centerOnInit
      >
        {header && (
          <div className="flex w-full max-w-125 items-center justify-between pb-2">
            {header}
          </div>
        )}
        <div className="relative w-full max-w-125 rounded-lg border bg-background shadow-sm overflow-hidden pb-8 md:pb-0">
          <TransformComponent
            wrapperStyle={{ width: "100%" }}
            contentStyle={{ width: "100%" }}
          >
            {children}
          </TransformComponent>
          <MapPinchHint />
        </div>
      </MapTransformWrapper>
    </div>
  );
}

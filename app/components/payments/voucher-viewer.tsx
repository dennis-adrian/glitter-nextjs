"use client";

import { useState } from "react";
import Image from "next/image";
import { MinimizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { TransformComponent, useControls } from "react-zoom-pan-pinch";

import MapTransformWrapper from "@/app/components/maps/map-transform-wrapper";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { cn } from "@/app/lib/utils";

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-background/90 backdrop-blur"
        onClick={() => zoomIn()}
        aria-label="Acercar el comprobante"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-background/90 backdrop-blur"
        onClick={() => zoomOut()}
        aria-label="Alejar el comprobante"
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-7 w-7 bg-background/90 backdrop-blur"
        onClick={() => resetTransform()}
        aria-label="Restablecer el zoom"
      >
        <MinimizeIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type VoucherViewerProps = {
  src: string;
  /** Frame height. The frame never resizes, so the dialog cannot shift. */
  className?: string;
};

/**
 * A comprobante, readable without leaving the page.
 *
 * The amount and the sender's name are often small on a phone screenshot, so
 * an admin deciding whether to accept one needs to get closer. Zoom and pan
 * happen inside a fixed frame: the container's size never depends on the
 * image, so neither the load nor the zooming moves anything around it.
 *
 * Built on MapTransformWrapper for two behaviours worth inheriting — panning
 * is off until you have actually zoomed in, and the wheel only zooms with
 * Control held, so scrolling still reaches the dialog behind it.
 */
export default function VoucherViewer({ src, className }: VoucherViewerProps) {
  const [settled, setSettled] = useState(false);

  return (
    <div
      className={cn(
        "relative h-72 w-full overflow-hidden rounded-md border bg-muted/40",
        className,
      )}
    >
      {!settled && <Skeleton className="absolute inset-0 z-10 rounded-none" />}

      <MapTransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        centerOnInit
      >
        <>
          <ZoomControls />
          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentClass="!h-full !w-full"
          >
            <div className="relative h-full w-full">
              <Image
                src={src}
                alt="Comprobante de pago"
                fill
                sizes="(min-width: 768px) 28rem, 90vw"
                className="object-contain"
                onLoad={() => setSettled(true)}
                // Also on error: a failed proxy fetch would otherwise leave the
                // skeleton pulsing forever, indistinguishable from a slow one.
                onError={() => setSettled(true)}
              />
            </div>
          </TransformComponent>
        </>
      </MapTransformWrapper>
    </div>
  );
}

"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FocusEvent,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import type { MerchCollection } from "@/app/lib/merch/definitions";
import CollectionBanner from "./collection-banner";

const ROTATION_MS = 8000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const motion = window.matchMedia?.(REDUCED_MOTION_QUERY);
  motion?.addEventListener("change", onChange);
  return () => motion?.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getPageHidden() {
  return document.hidden;
}

export default function FeaturedCollectionCarousel({
  collections,
}: {
  collections: MerchCollection[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [manualPause, setManualPause] = useState<boolean | null>(null);
  const [interacting, setInteracting] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    () => false,
  );
  const pageHidden = useSyncExternalStore(
    subscribeToVisibility,
    getPageHidden,
    () => false,
  );
  const paused = manualPause ?? reducedMotion;
  const currentIndex = activeIndex < collections.length ? activeIndex : 0;

  useEffect(() => {
    if (collections.length < 2 || paused || interacting || pageHidden) return;
    const timer = window.setInterval(
      () => setActiveIndex((index) => (index + 1) % collections.length),
      ROTATION_MS,
    );
    return () => window.clearInterval(timer);
  }, [collections.length, paused, interacting, pageHidden]);

  if (collections.length === 0) return null;
  if (collections.length === 1)
    return <CollectionBanner collection={collections[0]} />;

  function showIndex(index: number) {
    setActiveIndex((index + collections.length) % collections.length);
    setManualPause(true);
  }

  function onBannerBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setInteracting(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Colecciones destacadas"
      aria-roledescription="carrusel"
    >
      <div
        aria-live={paused ? "polite" : "off"}
        aria-atomic="true"
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocusCapture={() => setInteracting(true)}
        onBlurCapture={onBannerBlur}
      >
        <CollectionBanner collection={collections[currentIndex]} />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-2 text-xs text-muted-foreground">
          {currentIndex + 1} / {collections.length}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Ver colección anterior"
          onClick={() => showIndex(currentIndex - 1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Ver siguiente colección"
          onClick={() => showIndex(currentIndex + 1)}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          aria-label={paused ? "Reanudar rotación" : "Pausar rotación"}
          onClick={() => setManualPause(!paused)}
        >
          {paused ? (
            <Play className="size-4" aria-hidden="true" />
          ) : (
            <Pause className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

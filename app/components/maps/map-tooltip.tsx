"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import StandArtists from "@/app/components/stands/stand-artists";

type MapTooltipProps = {
  stand: StandWithReservationsWithParticipants;
  canBeReserved: boolean;
  participantProfiles: ProfileType[];
  anchorRect: DOMRect;
};

const GAP = 8;

export default function MapTooltip({
  stand,
  canBeReserved,
  participantProfiles,
  anchorRect,
}: MapTooltipProps) {
  const { label, standNumber, status } = stand;
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const recomputePosition = useCallback(() => {
    const el = tooltipRef.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: prefer right, flip to left if clipped
    let left = anchorRect.right + GAP;
    if (left + width > vw) {
      left = anchorRect.left - GAP - width;
    }
    // Clamp to viewport
    left = Math.max(GAP, Math.min(left, vw - width - GAP));

    // Vertical: center on the stand, then clamp to viewport
    let top = anchorRect.top + anchorRect.height / 2 - height / 2;
    top = Math.max(GAP, Math.min(top, vh - height - GAP));

    setPos({ top, left });
  }, [anchorRect]);

  // Initial position and anchorRect changes
  useLayoutEffect(() => {
    recomputePosition();
  }, [recomputePosition]);

  // Window resize and tooltip content size changes
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;

    window.addEventListener("resize", recomputePosition);

    const resizeObserver = new ResizeObserver(recomputePosition);
    resizeObserver.observe(el);

    return () => {
      window.removeEventListener("resize", recomputePosition);
      resizeObserver.disconnect();
    };
  }, [recomputePosition]);

  const tooltip = (
    <div
      ref={tooltipRef}
      className="fixed z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        top: pos.top,
        left: pos.left,
        pointerEvents: "none",
      }}
    >
      <div className="flex flex-col gap-2 min-w-[180px]">
        <div>
          <p className="text-sm font-semibold">
            Espacio {label}
            {standNumber}
          </p>
          {(canBeReserved || status !== "available") && (
            <StandStatusBadge status={status} />
          )}
        </div>
        <div>
          {status === "disabled" ? (
            <p className="text-sm text-muted-foreground text-center">
              Espacio deshabilitado
            </p>
          ) : (canBeReserved || status !== "available") &&
            stand.festivalId != null ? (
            <StandArtists
              festivalId={stand.festivalId}
              participants={participantProfiles}
              stand={stand}
            />
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              No puedes reservar en este espacio
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(tooltip, document.body);
}

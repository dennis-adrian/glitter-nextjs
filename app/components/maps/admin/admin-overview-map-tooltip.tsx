"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { ClockIcon, HistoryIcon } from "lucide-react";

type AdminOverviewMapTooltipProps = {
  stand: StandWithReservationsWithParticipants;
  invoice: InvoiceWithParticipants | null;
  cancelledInvoices: InvoiceWithParticipants[];
  anchorRect: DOMRect;
  dueDate?: Date | null;
  isOverdue?: boolean;
};

const GAP = 8;

export default function AdminOverviewMapTooltip({
  stand,
  invoice,
  cancelledInvoices,
  anchorRect,
  dueDate,
  isOverdue,
}: AdminOverviewMapTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

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
    left = Math.max(GAP, Math.min(left, vw - width - GAP));

    // Vertical: center on the anchor, then clamp to viewport
    let top = anchorRect.top + anchorRect.height / 2 - height / 2;
    top = Math.max(GAP, Math.min(top, vh - height - GAP));

    setPos({ top, left });
  }, [anchorRect]);

  useLayoutEffect(() => {
    recomputePosition();
  }, [recomputePosition]);

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

  const coParticipants =
    invoice?.reservation.participants.filter(
      (p) => p.user.id !== invoice.user.id,
    ) ?? [];

  const tooltip = (
    <div
      ref={tooltipRef}
      className="fixed z-50 rounded-md border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        top: pos.top,
        left: pos.left,
        pointerEvents: "none",
      }}
    >
      <div className="flex flex-col gap-2 min-w-45">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              Espacio {stand.label}
              {stand.standNumber}
            </p>
            {invoice && (
              <p className="text-xs text-muted-foreground">
                Reserva #{invoice.reservation.id}
              </p>
            )}
          </div>
          {invoice ? (
            <ReservationStatus reservation={invoice.reservation} />
          ) : (
            <StandStatusBadge status={stand.status} />
          )}
        </div>

        {invoice && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage
                  src={invoice.user.imageUrl ?? undefined}
                  alt={invoice.user.displayName ?? ""}
                />
              </Avatar>
              <span className="text-sm leading-tight">
                {invoice.user.displayName}{" "}
                <span className="text-xs text-muted-foreground">(titular)</span>
              </span>
            </div>
            {coParticipants.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage
                    src={p.user.imageUrl ?? undefined}
                    alt={p.user.displayName ?? ""}
                  />
                </Avatar>
                <span className="text-sm leading-tight">
                  {p.user.displayName}
                </span>
              </div>
            ))}
          </div>
        )}

        {dueDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="h-3 w-3 shrink-0" />
            <span>
              {isOverdue ? "Venció el " : "Vence el "}
              <span className="font-medium text-foreground">
                {new Intl.DateTimeFormat("es-BO", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(dueDate)}
              </span>
            </span>
          </div>
        )}

        {cancelledInvoices.length > 0 && (
          <div className="space-y-1.5 border-t pt-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <HistoryIcon className="h-3.5 w-3.5" />
              <span>Historial</span>
            </div>
            {cancelledInvoices.slice(0, 3).map((cancelledInvoice) => (
              <div
                key={cancelledInvoice.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span>
                  Reserva #{cancelledInvoice.reservation.id} ·{" "}
                  {cancelledInvoice.user.displayName}
                </span>
                <Badge variant="destructive" size="sm">
                  Cancelada
                </Badge>
              </div>
            ))}
            {cancelledInvoices.length > 3 && (
              <p className="text-[11px] text-muted-foreground">
                +{cancelledInvoices.length - 3} reservas canceladas
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(tooltip, document.body);
}

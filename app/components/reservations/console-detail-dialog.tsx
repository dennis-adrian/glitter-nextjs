"use client";

import ConsoleDetailPanel from "@/app/components/reservations/console-detail-panel";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Skeleton } from "@/app/components/ui/skeleton";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import type { ReservationConsoleDetail } from "@/app/lib/reservations/console-detail";

/**
 * The row's history, opened over the table rather than on its own route, so an
 * admin working a queue keeps their filters and their place in it.
 *
 * Presentational: the fetch happens in the handler that opens this, because
 * the history is three extra queries per row and is not worth paying for every
 * row of a festival to serve the few an admin expands.
 */
export default function ConsoleDetailDialog({
  reservationId,
  detail,
  isLoading,
  open,
  onOpenChange,
}: {
  reservationId: number;
  detail: ReservationConsoleDetail | null;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-4xl">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Historial de la reserva #{reservationId}
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop}>
            Créditos aplicados, comprobantes enviados y cada cambio de estado
            con quién lo hizo.
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 md:px-0 md:pb-0">
          {isLoading && !detail ? (
            <div className="grid gap-6 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`detail-skeleton-${index}`} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : detail ? (
            <ConsoleDetailPanel detail={detail} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No se pudo cargar el historial.
            </p>
          )}
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

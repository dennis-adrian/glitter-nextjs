"use client";

import { useMediaQuery } from "@/app/hooks/use-media-query";

import {
  DrawerDialog,
  DrawerDialogContent,
} from "@/app/components/ui/drawer-dialog";

export function ReservationModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop}>
        <h1>hello world</h1>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

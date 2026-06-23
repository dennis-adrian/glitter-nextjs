"use client";

import { useState } from "react";

import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { formatRentalContextStands } from "@/app/lib/rentals/rental-context";
import type { RentalEligibilityContext } from "@/app/lib/rentals/types";

type RentalFestivalPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rentalContexts: RentalEligibilityContext[];
  selectedReservationId: number | null;
  onSelectedReservationIdChange: (reservationId: number) => void;
};

export function RentalFestivalPickerDialog({
  open,
  onOpenChange,
  rentalContexts,
  selectedReservationId,
  onSelectedReservationIdChange,
}: RentalFestivalPickerDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  function handleSelect(value: string) {
    onSelectedReservationIdChange(Number(value));
    onOpenChange(false);
  }

  return (
    <DrawerDialog open={open} onOpenChange={onOpenChange} isDesktop={isDesktop}>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Selecciona tu festival
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={isDesktop ? "py-2" : "px-4 pb-4"}>
          <RadioGroup
            value={
              selectedReservationId != null
                ? String(selectedReservationId)
                : undefined
            }
            onValueChange={handleSelect}
            className="grid gap-3"
          >
            {rentalContexts.map((context) => (
              <Label
                key={context.reservationId}
                htmlFor={`rental-festival-${context.reservationId}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
              >
                <RadioGroupItem
                  value={String(context.reservationId)}
                  id={`rental-festival-${context.reservationId}`}
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <span className="text-sm font-medium">
                    {context.festivalName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRentalContextStands(context)}
                  </span>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

type RentalContextDescriptionProps = {
  context: RentalEligibilityContext;
  rentalContexts: RentalEligibilityContext[];
  selectedReservationId: number | null;
  onSelectedReservationIdChange: (reservationId: number) => void;
};

export function RentalContextDescription({
  context,
  rentalContexts,
  selectedReservationId,
  onSelectedReservationIdChange,
}: RentalContextDescriptionProps) {
  const [open, setOpen] = useState(false);
  const canChangeFestival = rentalContexts.length > 1;

  return (
    <>
      Alquiler para{" "}
      {canChangeFestival ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          className="text-primary underline-offset-2 hover:underline"
        >
          {context.festivalName}
        </button>
      ) : (
        context.festivalName
      )}
      {canChangeFestival && (
        <RentalFestivalPickerDialog
          open={open}
          onOpenChange={setOpen}
          rentalContexts={rentalContexts}
          selectedReservationId={selectedReservationId}
          onSelectedReservationIdChange={onSelectedReservationIdChange}
        />
      )}
    </>
  );
}

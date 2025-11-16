"use client";

import { Button } from "@/app/components/ui/button";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
} from "@/components/ui/drawer-dialog";
import Image from "next/image";
import { confirmReservation } from "@/app/api/reservations/actions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";
import { toast } from "sonner";
import SubmitButton from "@/app/components/simple-submit-button";

type PaymentProofModalProps = {
  invoice: InvoiceWithParticipants;
  imageUrl?: string;
  show: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function PaymentProofModal(props: PaymentProofModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const form = useForm();
  const isReservationConfirmed = props.invoice.reservation.status === "accepted";
  const action = form.handleSubmit(async () => {
    try {
      const result = await confirmReservation(
        props.invoice.reservationId,
        props.invoice.user,
        props.invoice.reservation.standId,
        `${props.invoice.reservation.stand.label}${props.invoice.reservation.stand.standNumber}`,
        props.invoice.reservation.festival,
        props.invoice.reservation.participants,
      );
      if (result.success) {
        toast.success("Reserva confirmada");
        props.onOpenChange(false);
        form.reset();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Error inesperado al confirmar la reserva");
      console.error(error);
    }
  });

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={props.show}
      onOpenChange={props.onOpenChange}
    >
      <DrawerDialogContent isDesktop={isDesktop}>
        <div className={`${isDesktop ? "" : "px-4"} py-4`}>
          {props.imageUrl && (
            <Image
              className="mx-auto"
              alt="Comprobante de pago"
              src={props.imageUrl}
              width={320}
              height={460}
            />
          )}
        </div>
        {isDesktop ? (
          <div className="flex gap-2 justify-end px-4 pb-4">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Cerrar
            </Button>
            <Form {...form}>
              <form onSubmit={action}>
                <SubmitButton
                  disabled={form.formState.isSubmitting || isReservationConfirmed}
                  loading={form.formState.isSubmitting}
                  label="Confirmar"
                  className="w-auto"
                />
              </form>
            </Form>
          </div>
        ) : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <Form {...form}>
              <form onSubmit={action} className="w-full">
                <SubmitButton
                  disabled={form.formState.isSubmitting || isReservationConfirmed}
                  loading={form.formState.isSubmitting}
                  label="Confirmar"
                />
              </form>
            </Form>
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline" className="w-full">
                Cerrar
              </Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

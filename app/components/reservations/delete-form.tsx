"use client";

import { deleteReservation } from "@/app/api/user_requests/actions";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Form, useForm } from "react-hook-form";
import { toast } from "sonner";

const DeleteReservationForm = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>({
  reservationId,
  children,
  ref
}: {
  reservationId: number;
  children: React.ReactNode;
}) => {
  const form = useForm();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await deleteReservation(reservationId);
    if (res.success) {
      toast.warning(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    } else {
      toast.error(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
    }
  });

  return (
    <>
      <DrawerDialog isDesktop={isDesktop}>
        <DrawerDialogTrigger isDesktop={isDesktop}>
          {children}
        </DrawerDialogTrigger>
        <DrawerDialogContent isDesktop={isDesktop}>
          <DrawerDialogHeader isDesktop={isDesktop}>
            <DrawerDialogTitle>Eliminar Reserva</DrawerDialogTitle>
          </DrawerDialogHeader>
          <div className={`${isDesktop ? "" : "px-4"}`}>
            <Form {...form}>
              <form
                action={action}
                className="text-center w-full flex flex-col justify-center items-center"
              >
                <div className="p-6">
                  <p className="mb-4">
                    ¿Estás seguro que deseas eliminar esta reserva?
                  </p>
                  <p>
                    Cualquier artista que haya sido parte de la reserva quedará
                    disponible para hacer una nueva
                  </p>
                </div>
                <Button
                  className="w-full mt-2"
                  variant="destructive"
                  type="submit"
                >
                  Eliminar
                </Button>
              </form>
            </Form>
          </div>
          {isDesktop ? null : (
            <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
              <DrawerDialogClose isDesktop={isDesktop}>
                <Button variant="outline">Cancelar</Button>
              </DrawerDialogClose>
            </DrawerDialogFooter>
          )}
        </DrawerDialogContent>
      </DrawerDialog>
    </>
  );
}

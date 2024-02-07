"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { PlusCircleIcon, TrashIcon } from "lucide-react";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { Label } from "@/app/components/ui/label";
import SearchInput from "@/app/components/ui/search-input/input";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Separator } from "@/app/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { updateReservation } from "@/app/api/user_requests/actions";
import { toast } from "sonner";
import { redirect } from "next/navigation";

export default function EditReservationForm({
  artistsOptions,
  reservation,
}: {
  artistsOptions: SearchOption[];
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
  const [firstParticipant, setFirstParticipant] = useState<number | undefined>(
    reservation.participants[0]?.userId,
  );
  const [secondParticipant, setSecondParticipant] = useState<
    number | undefined
  >(reservation.participants[1]?.userId);
  const [showSecondParticipant, setShowSecondParticipant] = useState(
    !!secondParticipant,
  );

  const form = useForm({
    defaultValues: {
      status: reservation.status,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const participants = [
      {
        participationId: reservation.participants[0]?.id,
        userId: firstParticipant,
      },
      {
        participationId: reservation.participants[1]?.id,
        userId: secondParticipant,
      },
    ];

    const res = await updateReservation(reservation.id, {
      ...reservation,
      ...data,
      updatedParticipants: participants.filter(Boolean),
    });

    if (res.success) {
      toast.success(res.message, {
        duration: 3000,
        action: {
          label: "Cerrar",
          onClick: () => {
            toast.dismiss();
          },
        },
      });
      redirect("/dashboard/reservations");
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
      <section className="flex flex-col">
        <div className="mb-4">
          <div className="my-2">
            <h4 className="text-sm text-muted-foreground">Participante 1</h4>
            <span className="text-lg">
              {
                artistsOptions.find((a) => a.id === firstParticipant)
                  ?.displayName
              }
            </span>
          </div>
          <Label htmlFor="first-participant">
            Remplaza al artista buscando un nombre
          </Label>
          <SearchInput
            id="first-participant"
            options={artistsOptions}
            placeholder="Ingresa el nombre..."
            onSelect={setFirstParticipant}
          />
        </div>
        {showSecondParticipant ? (
          <div className="mb-4">
            <div className="my-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm text-muted-foreground">
                  Participante 2
                </h4>
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => {
                    setShowSecondParticipant(false);
                    setSecondParticipant(undefined);
                  }}
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              </div>
              <span className="text-lg">
                {
                  artistsOptions.find((a) => a.id === secondParticipant)
                    ?.displayName
                }
              </span>
            </div>
            <Label htmlFor="first-participant">
              Agrega o remplaza buscando un nombre
            </Label>
            <SearchInput
              id="first-participant"
              options={artistsOptions}
              placeholder="Ingresa el nombre..."
              onSelect={setSecondParticipant}
            />
          </div>
        ) : (
          <Button variant="link" onClick={() => setShowSecondParticipant(true)}>
            <PlusCircleIcon className="h-4 w-4 mr-2" />
            Agregar participante
          </Button>
        )}
      </section>
      <Separator className="my-4" />
      <Form {...form}>
        <form action={action} className="grid items-start gap-4">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Estado de la reserva</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige una opción" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="accepted">Aceptada</SelectItem>
                    <SelectItem value="rejected">Rechazada</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Guardar cambios</Button>
        </form>
      </Form>
    </>
  );
}

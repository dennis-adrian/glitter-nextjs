"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { PlusCircleIcon, TrashIcon } from "lucide-react";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
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
import { FormParticipantCard } from "@/app/components/reservations/form/participant-card";
import { BaseProfile } from "@/app/api/users/definitions";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

type Artist = Omit<BaseProfile, "userRequests" | "participations">;
export default function EditReservationForm({
  artists,
  artistsOptions,
  reservation,
}: {
  artists: Artist[];
  artistsOptions: SearchOption[];
  reservation: ReservationWithParticipantsAndUsersAndStand;
}) {
  const [participants, setParticipants] = useState<(Artist | undefined)[]>(
    reservation.participants.map((p) => p.user),
  );

  const form = useForm({
    defaultValues: {
      status: reservation.status,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const updatedParticipants = [
      {
        participationId: reservation.participants[0]?.id,
        userId: participants[0]?.id,
      },
      {
        participationId: reservation.participants[1]?.id,
        userId: participants[1]?.id,
      },
    ];
    const res = await updateReservation(reservation.id, {
      ...reservation,
      ...data,
      updatedParticipants: updatedParticipants.filter(Boolean),
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

  const handleParticipantChange = (
    participantIndex: number = participants.length,
    userId?: number,
  ) => {
    const newParticipants = [...participants];
    let artist;
    if (userId) {
      artist = artists.find((a) => a.id === userId);
    }

    newParticipants[participantIndex] = artist;
    setParticipants([...newParticipants]);
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        {participants.length > 0 ? (
          participants.map((participant, index) => (
            <FormParticipantCard
              key={index}
              options={artistsOptions}
              participant={participant}
              participantIndex={index}
              onParticipantChange={handleParticipantChange}
              onParticipantRemove={() =>
                setParticipants([...participants.toSpliced(index, 1)])
              }
            />
          ))
        ) : (
          <Card>
            <CardHeader className="flex items-center">
              <h2 className="text-muted-foreground text-xl sm:text-2xl text-center">
                Sin participantes
              </h2>
            </CardHeader>
          </Card>
        )}
        {participants.length < 2 && (
          <Button variant="link" onClick={() => handleParticipantChange()}>
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

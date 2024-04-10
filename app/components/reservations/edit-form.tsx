"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { Loader2Icon, PlusCircleIcon, TrashIcon } from "lucide-react";

import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";

type Artist = Omit<BaseProfile, "userRequests" | "participations">;
export default function EditReservationForm({
  artists,
  artistsOptions,
  reservation,
}: {
  artists: Artist[];
  artistsOptions: SearchOption[];
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
}) {
  const [partner, setPartner] = useState<Artist | undefined>(
    reservation.participants[1]?.user,
  );
  const [showPartnerForm, setShowPartnerForm] = useState(false);

  const form = useForm({
    defaultValues: {
      status: reservation.status,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const updatedParticipants = [
      {
        participationId: reservation.participants[0]?.userId,
        userId: reservation.participants[0]?.userId,
      },
      {
        participationId: reservation.participants[1]?.id,
        userId: partner?.id,
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

  const handlePartnerChange = (userId?: number) => {
    if (userId) {
      setPartner(artists.find((a) => a.id === userId));
    } else {
      setPartner(undefined);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex gap-4">
          <Avatar>
            <AvatarImage
              src={reservation.participants[0].user.imageUrl!}
              alt={reservation.participants[0].user.displayName!}
              height={64}
              width={64}
            />
          </Avatar>
          <div className="flex flex-col justify-center">
            <h3 className="font-semibold text-sm">
              {reservation.participants[0].user.displayName}
            </h3>
            <p className="text-sm max-w-[160px] sm:max-w-full truncate text-muted-foreground">
              {reservation.participants[0].user.email}
            </p>
          </div>
        </div>
        {showPartnerForm && (
          <FormParticipantCard
            options={artistsOptions}
            participant={partner}
            onParticipantChange={handlePartnerChange}
            onRemove={() => {
              setShowPartnerForm(false);
              handlePartnerChange();
            }}
          />
        )}
        {!showPartnerForm && (
          <Button variant="link" onClick={() => setShowPartnerForm(true)}>
            <PlusCircleIcon className="h-4 w-4 mr-2" />
            Agregar participante
          </Button>
        )}
      </section>
      <Separator className="my-4" />
      <Form {...form}>
        <form action={action} className="grid items-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="text-lg sm:text-xl">Estado de la reserva</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Elige una opción</FormLabel>
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
            </CardContent>
          </Card>
          <Button
            disabled={form.formState.isSubmitting}
            className="w-full md:max-w-60"
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Cargando
              </>
            ) : (
              <span>Guardar cambios</span>
            )}
          </Button>
        </form>
      </Form>
    </>
  );
}

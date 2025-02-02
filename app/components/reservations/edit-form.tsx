"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { Loader2Icon, PlusCircleIcon, Trash2Icon } from "lucide-react";

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
import { updateReservationSimple } from "@/app/api/user_requests/actions";
import { toast } from "sonner";
import { redirect } from "next/navigation";
import { BaseProfile } from "@/app/api/users/definitions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { Label } from "@/app/components/ui/label";
import SearchInput from "@/app/components/ui/search-input/input";

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
  const [showInput, setShowInput] = useState(false);

  const form = useForm({
    defaultValues: {
      status: reservation.status,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const updatedPartner = {
      participationId: reservation.participants[1]?.id,
      userId: partner?.id,
    };
    const res = await updateReservationSimple(reservation.id, {
      ...reservation,
      ...data,
      partner: updatedPartner,
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

  function handleAddPartner(userId: number) {
    setPartner(artists.find((a) => a.id === userId));
  }

  function removePartner() {
    setPartner(undefined);
    setShowInput(false);
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="p-4 border rounded-lg">
          <h2 className="font-semibold text-lg mb-2">
            Participante que hizo la reserva
          </h2>
          <ProfileQuickViewInfo
            showAdminControls
            profile={reservation.participants[0].user}
          />
        </div>
        {partner && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <h2 className="font-semibold text-lg">Compañero de espacio</h2>
              <Trash2Icon
                className="w-4 h-4 text-destructive hover:text-red-600 hover:transition cursor-pointer"
                onClick={() => removePartner()}
              />
            </div>
            <ProfileQuickViewInfo showAdminControls profile={partner} />
          </div>
        )}
        {showInput && !partner && (
          <>
            <Label htmlFor="first-participant">
              Busca el compañero de espacio
            </Label>
            <SearchInput
              id="first-participant"
              options={artistsOptions}
              onSelect={(id) => handleAddPartner(id)}
            />
          </>
        )}
        {!showInput && !partner && (
          <Button variant="link" onClick={() => setShowInput(true)}>
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

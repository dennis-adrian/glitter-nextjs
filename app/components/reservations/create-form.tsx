"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { createReservation } from "@/api/reservations/actions";
import { StandBase } from "@/app/api/stands/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import { ArtistsSearch } from "@/app/components/reservations/form/artists-search";
import { SubmitButton } from "@/app/components/reservations/form/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

export function CreateReservationForm({
  artists,
  artistsOptions,
  stands,
}: {
  artists: BaseProfile[];
  artistsOptions: SearchOption[];
  stands: StandBase[];
}) {
  const [participants, setParticipants] = useState<(BaseProfile | undefined)[]>(
    [],
  );

  const createReservationWithParticipants = createReservation.bind(
    null,
    stands[0].festivalId,
    participants.filter(Boolean) as BaseProfile[],
  );

  const [state, action] = useFormState(createReservationWithParticipants, {
    success: false,
    message: "",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la reserva</CardTitle>
        <CardDescription>
          Puedes crear una reserva artista o sin artistas y agregarlos luego
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" action={action}>
          <div>
            <Label htmlFor="stand">Espacio</Label>
            <Select name="stand" required>
              <SelectTrigger id="stand">
                <SelectValue placeholder="Elige una opción" />
              </SelectTrigger>
              <SelectContent>
                {stands?.map((stand) => (
                  <SelectItem key={stand.id} value={stand.id.toString()}>
                    <span>
                      Espacio {stand.label}
                      {stand.standNumber}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArtistsSearch
            artists={artists}
            options={artistsOptions}
            participants={participants}
            setParticipants={setParticipants}
          />
          <SubmitButton
            formState={state}
            redirectOnSuccess
            redirectUrl="/dashboard/reservations"
          />
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import { FormParticipantCard } from "@/app/components/reservations/form/participant-card";
import { Button } from "@/app/components/ui/button";
import { Card, CardHeader } from "@/app/components/ui/card";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";

export function ArtistsSearch({
  artists,
  options,
  participants,
  setParticipants,
}: {
  artists: BaseProfile[];
  options: SearchOption[];
  participants: (BaseProfile | undefined)[];
  setParticipants: (participants: (BaseProfile | undefined)[]) => void;
}) {
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
    <section className="flex flex-col gap-4">
      {participants.length > 0 ? (
        participants.map((participant, index) => (
          <FormParticipantCard
            key={index}
            options={options}
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
  );
}

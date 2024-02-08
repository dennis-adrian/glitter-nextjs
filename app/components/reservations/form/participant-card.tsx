"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import SearchInput from "@/app/components/ui/search-input/input";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import { Trash2Icon, TrashIcon } from "lucide-react";

export function FormParticipantCard({
  options,
  participant,
  participantIndex,
  onParticipantChange,
  onParticipantRemove,
}: {
  options: SearchOption[];
  participant?: BaseProfile;
  participantIndex: number;
  onParticipantChange: (index: number, id: number) => void;
  onParticipantRemove: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-muted-foreground">Artista</h2>
          <Trash2Icon
            className="w-4 h-4 text-destructive"
            onClick={onParticipantRemove}
          />
        </div>
        {!participant ? (
          <>
            <div className="flex gap-4">
              <Avatar>
                <AvatarImage
                  src="/img/profile-avatar.png"
                  alt="Participante"
                  height={64}
                  width={64}
                />
              </Avatar>
              <div className="flex items-center">
                <h3 className="text-sm text-muted-foreground">
                  Sin artista asignado
                </h3>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-4">
              <Avatar>
                <AvatarImage
                  src={participant.imageUrl!}
                  alt={participant.displayName!}
                  height={64}
                  width={64}
                />
              </Avatar>
              <div className="flex flex-col justify-center">
                <h3 className="font-semibold text-sm">
                  {participant.displayName}
                </h3>
                <p className="text-sm max-w-[200px] sm:max-w-full truncate text-muted-foreground">
                  {participant.email}
                </p>
              </div>
            </div>
          </>
        )}
      </CardHeader>
      <CardContent>
        <Label htmlFor="first-participant">
          Agrega o remplaza al artista buscando un nombre
        </Label>
        <SearchInput
          id="first-participant"
          options={options}
          placeholder="Ingresa el nombre..."
          onSelect={(id) => onParticipantChange(participantIndex, id)}
        />
      </CardContent>
    </Card>
  );
}

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
  onParticipantChange,
  onRemove,
}: {
  options: SearchOption[];
  participant?: BaseProfile;
  onParticipantChange: (id?: number) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-muted-foreground"></h2>
          <Trash2Icon
            className="w-4 h-4 text-destructive hover:text-red-600 hover:transition"
            onClick={() => onRemove()}
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
                <p className="text-sm max-w-[160px] sm:max-w-full truncate text-muted-foreground">
                  {participant.email}
                </p>
              </div>
            </div>
          </>
        )}
      </CardHeader>
      <CardContent>
        <Label htmlFor="first-participant">Busca un nombre</Label>
        <SearchInput
          id="first-participant"
          options={options}
          onSelect={(id) => onParticipantChange(id)}
        />
      </CardContent>
    </Card>
  );
}

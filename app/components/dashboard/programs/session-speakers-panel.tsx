"use client";

import { XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  attachSpeakerToSession,
  detachSpeakerFromSession,
} from "@/app/lib/programs/admin-actions";
import type {
  SessionSpeakerWithSpeaker,
  Speaker,
} from "@/app/lib/programs/definitions";

type Props = {
  sessionId: number;
  assigned: SessionSpeakerWithSpeaker[];
  speakers: Speaker[];
};

export default function SessionSpeakersPanel({
  sessionId,
  assigned,
  speakers,
}: Props) {
  const [speakerId, setSpeakerId] = useState("");
  const [role, setRole] = useState("");
  const [isPending, startTransition] = useTransition();

  const assignedIds = new Set(assigned.map((entry) => entry.speakerId));
  const available = speakers.filter(
    (speaker) => speaker.isActive && !assignedIds.has(speaker.id),
  );

  function run(promise: Promise<{ success: boolean; message: string }>) {
    startTransition(async () => {
      try {
        const result = await promise;
        if (result.success) {
          toast.success(result.message);
          setSpeakerId("");
          setRole("");
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo actualizar el expositor");
      }
    });
  }

  return (
    <div className="space-y-4">
      {assigned.length > 0 ? (
        <ul className="space-y-2">
          {assigned.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {entry.speaker.publicName}
                </p>
                {entry.role ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.role}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar a ${entry.speaker.publicName}`}
                disabled={isPending}
                onClick={() =>
                  run(detachSpeakerFromSession(sessionId, entry.speakerId))
                }
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Sin expositores. Una sesión necesita al menos uno para publicarse.
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`speaker-select-${sessionId}`}>Agregar expositor</Label>
        <Select value={speakerId} onValueChange={setSpeakerId}>
          <SelectTrigger id={`speaker-select-${sessionId}`}>
            <SelectValue placeholder="Elige un expositor" />
          </SelectTrigger>
          <SelectContent>
            {available.map((speaker) => (
              <SelectItem key={speaker.id} value={String(speaker.id)}>
                {speaker.publicName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Rol (opcional): Facilitadora, Invitado…"
          disabled={isPending}
        />
        <Button
          variant="secondary"
          disabled={isPending || !speakerId}
          onClick={() =>
            run(
              attachSpeakerToSession({
                sessionId,
                speakerId: Number(speakerId),
                role,
                displayOrder: assigned.length,
              }),
            )
          }
        >
          Agregar
        </Button>
      </div>
    </div>
  );
}

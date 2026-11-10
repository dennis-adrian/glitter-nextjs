"use client";

import { useId } from "react";

import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import type { ReservationsOpenChannels } from "@/app/lib/festivals/reservations-open-definitions";
import { cn } from "@/app/lib/utils";

/**
 * How a festival notice reaches participants: email, the in-app item, and a
 * push, which opens the in-app item and so needs it.
 */

const CHANNEL_OPTIONS: {
  key: keyof ReservationsOpenChannels;
  label: string;
  description: string;
}[] = [
  {
    key: "email",
    label: "Correo electrónico",
    description:
      "No llega a quienes se dieron de baja de los avisos para participantes.",
  },
  {
    key: "inApp",
    label: "Notificación en Glitter",
    description: "Aparece en sus notificaciones dentro de Glitter.",
  },
  {
    key: "push",
    label: "Notificación push",
    description:
      "En los dispositivos con notificaciones activadas. Necesita la notificación en Glitter, que es la que abre.",
  },
];

/** Keeps the channels valid as one changes: push needs in-app. */
export function nextChannels(
  channels: ReservationsOpenChannels,
  key: keyof ReservationsOpenChannels,
  checked: boolean,
): ReservationsOpenChannels {
  const next = { ...channels, [key]: checked };
  if (key === "inApp" && !checked) next.push = false;
  return next;
}

export function ChannelChoices({
  channels,
  disabled,
  onChange,
}: {
  channels: ReservationsOpenChannels;
  disabled: boolean;
  onChange: (key: keyof ReservationsOpenChannels, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      {CHANNEL_OPTIONS.map((option) => {
        const optionId = `${id}-${option.key}`;
        const locked = option.key === "push" && !channels.inApp;
        return (
          <div key={option.key} className="flex items-start gap-3">
            <Checkbox
              id={optionId}
              checked={channels[option.key]}
              disabled={disabled || locked}
              onCheckedChange={(checked) =>
                onChange(option.key, checked === true)
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor={optionId}
                className={cn(
                  "text-sm font-medium",
                  (disabled || locked) && "text-muted-foreground",
                )}
              >
                {option.label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {option.description}
              </p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

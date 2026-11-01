"use client";

import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH,
  DISTRIBUTION_LIST_NAME_MAX_LENGTH,
} from "@/app/lib/distribution_lists/definitions";

function LengthCounter({ length, max }: { length: number; max: number }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {length}/{max}
    </span>
  );
}

/** Name and description, shared by both editors. */
export default function ListDetailsFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  disabled = false,
}: {
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="list-name" className="text-sm font-medium">
            Nombre
          </label>
          <LengthCounter
            length={name.length}
            max={DISTRIBUTION_LIST_NAME_MAX_LENGTH}
          />
        </div>
        <Input
          id="list-name"
          value={name}
          maxLength={DISTRIBUTION_LIST_NAME_MAX_LENGTH}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Por ejemplo: Ilustración La Paz"
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="list-description" className="text-sm font-medium">
            Descripción
          </label>
          <LengthCounter
            length={description.length}
            max={DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH}
          />
        </div>
        <Textarea
          id="list-description"
          value={description}
          maxLength={DISTRIBUTION_LIST_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Para qué es la lista. Solo la ve el equipo."
          rows={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

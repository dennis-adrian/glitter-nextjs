"use client";

import { GlobeIcon, LockIcon } from "lucide-react";

import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type { PostAudience } from "@/app/lib/posts/definitions";

type Props = {
  value: PostAudience;
  onChange: (value: PostAudience) => void;
  disabled?: boolean;
};

/**
 * Who gets to read the article. The description under each option says what
 * actually happens, because "solo participantes" alone does not tell an author
 * that the title still shows publicly.
 */
export default function AudienceSelect({ value, onChange, disabled }: Props) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="post-audience">Quién puede leerlo</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as PostAudience)}
        disabled={disabled}
      >
        <SelectTrigger id="post-audience" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="public">
            <span className="flex items-center gap-2">
              <GlobeIcon className="size-4" />
              Todo el mundo
            </span>
          </SelectItem>
          <SelectItem value="participants">
            <span className="flex items-center gap-2">
              <LockIcon className="size-4" />
              Solo participantes
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {value === "public"
          ? "Cualquier persona puede leer el artículo completo."
          : "El título y la portada siguen siendo visibles para todos, pero el contenido solo lo pueden leer participantes con perfil verificado."}
      </p>
    </div>
  );
}

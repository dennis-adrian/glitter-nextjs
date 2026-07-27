"use client";

import { XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  addFeatureFlagTarget,
  removeFeatureFlagTarget,
} from "@/app/lib/feature_flags/actions";
import {
  targetDisplayName,
  type FeatureFlagTarget,
} from "@/app/lib/feature_flags/definitions";

type Props = {
  flagKey: string;
  targets: FeatureFlagTarget[];
};

/**
 * Per-user access for a flag. These people see the feature no matter what the
 * visibility says, so the copy has to make that unmistakable.
 */
export default function FeatureFlagTargets({ flagKey, targets }: Props) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!email.trim()) return;

    startTransition(async () => {
      try {
        const result = await addFeatureFlagTarget({
          key: flagKey,
          email,
          note,
        });

        if (result.success) {
          toast.success(result.message);
          setEmail("");
          setNote("");
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("No se pudo otorgar el acceso");
      }
    });
  }

  function handleRemove(userId: number) {
    startTransition(async () => {
      try {
        const result = await removeFeatureFlagTarget({ key: flagKey, userId });

        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch {
        toast.error("No se pudo retirar el acceso");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/70 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Acceso individual</h4>
        <p className="text-sm text-muted-foreground">
          Estas personas ven la funcionalidad aunque esté oculta. Útil para
          testers antes de publicarla.
        </p>
      </div>

      {targets.length > 0 ? (
        <ul className="space-y-2">
          {targets.map((target) => (
            <li
              key={target.id}
              className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {targetDisplayName(target)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {target.email}
                  {target.note ? ` · ${target.note}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Retirar acceso a ${targetDisplayName(target)}`}
                onClick={() => handleRemove(target.userId)}
                disabled={isPending}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no hay accesos individuales.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${flagKey}-target-email`}>Correo del perfil</Label>
        <Input
          id={`${flagKey}-target-email`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="persona@ejemplo.com"
          disabled={isPending}
        />
        <Label htmlFor={`${flagKey}-target-note`}>Nota (opcional)</Label>
        <Input
          id={`${flagKey}-target-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nota opcional: QA, beta, etc."
          disabled={isPending}
        />
        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={isPending || !email.trim()}
        >
          Agregar persona
        </Button>
      </div>
    </div>
  );
}

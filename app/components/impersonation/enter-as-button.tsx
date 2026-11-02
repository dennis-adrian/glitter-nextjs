"use client";

import { EyeIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";

import { announceViewChange } from "@/app/components/impersonation/view-state";
import { IMPERSONATION_DURATION_MINUTES } from "@/app/lib/impersonation/definitions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/app/components/ui/button";

const START_URL = "/api/impersonation/start";

export type EnterAsPerson = {
  id: number;
  name: string;
  email: string;
  statusLabel: string;
};

/**
 * Starts "Entrar como participante" for one person, after a confirmation
 * that says exactly what will and will not happen. On success the app is
 * loaded again as a whole new document, as the participant
 * (docs/PLAN-impersonation.md §5.1); every check happens on the server.
 */
export default function EnterAsButton({
  person,
  label = "Entrar",
  returnTo,
  variant = "outline",
  size = "sm",
  className,
}: {
  person: EnterAsPerson;
  label?: string;
  /** The admin page Salir comes back to. */
  returnTo: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function enter() {
    setEntering(true);
    setMessage(null);
    try {
      const response = await fetch(START_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectId: person.id, returnTo }),
        cache: "no-store",
      });
      const body = (await response.json()) as
        | { success: true; redirectTo: string }
        | { success: false; message?: string };
      if (!body.success) {
        setMessage(body.message ?? "No se pudo entrar. Intentá de nuevo.");
        setEntering(false);
        return;
      }
      announceViewChange();
      window.location.assign(body.redirectTo);
    } catch {
      setMessage("No se pudo entrar. Intentá de nuevo.");
      setEntering(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (entering) return;
        setOpen(next);
        if (!next) setMessage(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <EyeIcon aria-hidden="true" className="size-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Entrar como {person.name}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                {person.email} · {person.statusLabel}
              </p>
              <p>
                Vas a ver Glitter como esta persona. Solo lectura: no se guarda
                nada, no se envían correos ni avisos. La vista termina sola a
                los {IMPERSONATION_DURATION_MINUTES} minutos.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={entering}>Cancelar</AlertDialogCancel>
          <Button onClick={enter} disabled={entering}>
            {entering ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}
            Entrar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

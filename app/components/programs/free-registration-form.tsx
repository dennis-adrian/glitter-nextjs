"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { registerForFreeSession } from "@/app/lib/programs/registration-actions";

type Props = {
  occurrenceId: number;
  sessionTitle: string;
  scheduleLabel: string;
  isSignedIn: boolean;
};

const EMPTY_GUEST = { name: "", email: "", phone: "" };

/**
 * Registration for a free session.
 *
 * On success it navigates to the secure purchase page, which is where the QR
 * and the save-this-link box live — the raw access token exists only in this
 * response, so it has to be handed straight to that URL and never re-fetched.
 */
export default function FreeRegistrationForm({
  occurrenceId,
  sessionTitle,
  scheduleLabel,
  isSignedIn,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [guest, setGuest] = useState(EMPTY_GUEST);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isPending, startTransition] = useTransition();

  /**
   * Minted on first submit and kept in a ref, so every retry from this form
   * carries the same key and cannot take a second seat.
   *
   * Deliberately not generated during render: `crypto.randomUUID()` is impure,
   * and a re-render must not produce a fresh key.
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  function ensureIdempotencyKey(): string {
    if (idempotencyKeyRef.current === null) {
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return idempotencyKeyRef.current;
  }

  const guestComplete =
    guest.name.trim() && guest.email.trim() && guest.phone.trim();
  const canSubmit =
    acceptsPolicy && (isSignedIn || guestComplete) && !isPending;

  function set(field: keyof typeof EMPTY_GUEST, value: string) {
    setGuest((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await registerForFreeSession({
          occurrenceId,
          acceptsNoRefundPolicy: true,
          idempotencyKey: ensureIdempotencyKey(),
          ...(isSignedIn
            ? {}
            : {
                guestName: guest.name,
                guestEmail: guest.email,
                guestPhone: guest.phone,
              }),
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success(result.message);
        setOpen(false);
        router.push(
          `/programs/purchases/${result.purchaseId}?token=${result.accessToken}`,
        );
      } catch (error) {
        console.error(error);
        toast.error("No pudimos completar tu inscripción. Intenta de nuevo.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Inscribirme</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sessionTitle}</DialogTitle>
          <DialogDescription>
            {scheduleLabel} · Inscripción sin costo
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {isSignedIn ? (
            <p className="text-sm text-muted-foreground">
              Usaremos los datos de tu perfil para emitir la entrada.
            </p>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`guest-name-${occurrenceId}`}>Nombre</Label>
                <Input
                  id={`guest-name-${occurrenceId}`}
                  value={guest.name}
                  onChange={(event) => set("name", event.target.value)}
                  disabled={isPending}
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`guest-email-${occurrenceId}`}>Correo</Label>
                <Input
                  id={`guest-email-${occurrenceId}`}
                  type="email"
                  value={guest.email}
                  onChange={(event) => set("email", event.target.value)}
                  disabled={isPending}
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  Ahí te enviamos el QR de tu entrada.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`guest-phone-${occurrenceId}`}>Teléfono</Label>
                <Input
                  id={`guest-phone-${occurrenceId}`}
                  type="tel"
                  value={guest.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  disabled={isPending}
                  autoComplete="tel"
                />
              </div>
            </div>
          )}

          <Label
            htmlFor={`policy-${occurrenceId}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3"
          >
            <Checkbox
              id={`policy-${occurrenceId}`}
              checked={acceptsPolicy}
              onCheckedChange={(checked) => setAcceptsPolicy(checked === true)}
              disabled={isPending}
              className="mt-0.5"
            />
            <span className="text-sm font-normal">
              Entiendo que puedo cancelar hasta dos días antes de la sesión y
              que la cancelación no genera reembolso.
            </span>
          </Label>
        </div>

        <DialogFooter>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {isPending ? "Inscribiendo..." : "Confirmar inscripción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

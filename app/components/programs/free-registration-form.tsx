"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import DateInput from "@/app/components/form/fields/date";
import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import {
  birthdateValidator,
  phoneValidator,
} from "@/app/components/form/input-validators";
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
import { Form } from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { registerForFreeSession } from "@/app/lib/programs/registration-actions";
import { genderOptions } from "@/app/lib/utils";

type Props = {
  occurrenceId: number;
  programSlug: string;
  sessionSlug: string;
  sessionTitle: string;
  scheduleLabel: string;
  isSignedIn: boolean;
  /** Null when availability could not be resolved for this occurrence. */
  seatsRemaining: number | null;
};

/**
 * Guests give the same details a festival visitor does, so attendance can be
 * reported on consistently. A signed-in attendee already has all of it on their
 * profile and is only asked to confirm.
 */
const guestSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre completo"),
  email: z.string().trim().email("El correo no es válido"),
  phone: phoneValidator(),
  gender: z.enum(["male", "female", "non_binary", "other", "undisclosed"]),
  birthdate: birthdateValidator({}),
});

/**
 * Input and output diverge because `birthdateValidator` coerces: the field
 * holds whatever the date input produces, the handler receives a `Date`. Same
 * three-generic shape `qr-code-form.tsx` uses.
 */
type GuestInput = z.input<typeof guestSchema>;
type GuestValues = z.output<typeof guestSchema>;

export default function FreeRegistrationForm({
  occurrenceId,
  programSlug,
  sessionSlug,
  sessionTitle,
  scheduleLabel,
  isSignedIn,
  seatsRemaining,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Shared by every funnel step so PostHog can chain them without a join. Free
   * and paid registrations emit the same event names, separated by `is_free`.
   */
  const funnelProperties = {
    occurrence_id: occurrenceId,
    program_slug: programSlug,
    session_slug: sessionSlug,
    session_title: sessionTitle,
    is_free: true,
    is_signed_in: isSignedIn,
    seats_remaining: seatsRemaining,
  };

  /**
   * Distinguishes "closed the dialog without trying" from "tried and failed",
   * which are different problems: the first is copy or price, the second is the
   * form itself. Set on submit, so a success path never reports as abandoned.
   */
  const submittedRef = useRef(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      submittedRef.current = false;
      captureClientEvent(
        POSTHOG_EVENTS.PROGRAM_REGISTRATION_STARTED,
        funnelProperties,
      );
      return;
    }

    if (!submittedRef.current) {
      captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_ABANDONED, {
        ...funnelProperties,
        accepted_policy: acceptsPolicy,
      });
    }
  }

  const form = useForm<GuestInput, unknown, GuestValues>({
    resolver: zodResolver(guestSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      gender: undefined,
      birthdate: "",
    },
  });

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

  async function submit(guest: GuestValues | null) {
    /**
     * The consent the buyer actually gave, not a hardcoded `true`. The disabled
     * button already blocks both submit paths, so this guard is what keeps the
     * value honest if that ever changes — and narrows `boolean` to the `true`
     * the server action's schema demands.
     */
    if (!acceptsPolicy) {
      toast.error("Confirma que entiendes la política para continuar");
      return;
    }

    submittedRef.current = true;
    captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_SUBMITTED, {
      ...funnelProperties,
      is_guest: guest !== null,
    });

    setIsSubmitting(true);
    try {
      const result = await registerForFreeSession({
        occurrenceId,
        acceptsNoRefundPolicy: acceptsPolicy,
        idempotencyKey: ensureIdempotencyKey(),
        ...(guest
          ? {
              guestName: guest.name,
              guestEmail: guest.email,
              guestPhone: guest.phone,
              guestGender: guest.gender,
              guestBirthdate: guest.birthdate,
            }
          : {}),
      });

      if (!result.success) {
        // The server's own copy, which is a fixed set of strings — safe to use
        // as a breakdown without exploding cardinality.
        captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_FAILED, {
          ...funnelProperties,
          is_guest: guest !== null,
          failure: "rejected",
          reason: result.message,
        });
        toast.error(result.message);
        return;
      }

      captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_COMPLETED, {
        ...funnelProperties,
        is_guest: guest !== null,
        purchase_id: result.purchaseId,
      });
      toast.success(result.message);
      setOpen(false);
      router.push(
        `/programs/purchases/${result.purchaseId}?token=${result.accessToken}`,
      );
    } catch (error) {
      console.error(error);
      // No `reason`: see the voucher card — an arbitrary throw message is
      // unbounded cardinality, and `capture_exceptions` already has the stack.
      captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_FAILED, {
        ...funnelProperties,
        is_guest: guest !== null,
        failure: "exception",
      });
      toast.error("No pudimos completar tu inscripción. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function onGuestSubmit(event: FormEvent<HTMLFormElement>) {
    return form.handleSubmit((values) => submit(values))(event);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="rounded-full bg-[#9347f5] px-5 font-black text-white hover:bg-[#7f36dc]"
        >
          Inscribirme
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sessionTitle}</DialogTitle>
          <DialogDescription>
            {scheduleLabel} · Inscripción sin costo
          </DialogDescription>
        </DialogHeader>

        {isSignedIn ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Usaremos los datos de tu perfil para emitir la entrada.
            </p>
            <PolicyCheckbox
              occurrenceId={occurrenceId}
              checked={acceptsPolicy}
              onChange={setAcceptsPolicy}
              disabled={isSubmitting}
            />
            <DialogFooter>
              <Button
                disabled={!acceptsPolicy || isSubmitting}
                onClick={() => submit(null)}
              >
                {isSubmitting ? "Inscribiendo..." : "Confirmar inscripción"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form className="grid gap-4" onSubmit={onGuestSubmit}>
              <TextInput label="Nombre completo" name="name" required />
              <TextInput
                label="Correo"
                name="email"
                type="email"
                description="Ahí te enviamos el QR de tu entrada."
                required
              />
              <PhoneInput name="phone" label="Teléfono" required />
              <div className="grid gap-4 md:grid-cols-2">
                <DateInput
                  formControl={form.control}
                  name="birthdate"
                  label="Fecha de nacimiento"
                  placeholder="Selecciona tu fecha de nacimiento"
                  required
                />
                <SelectInput
                  formControl={form.control}
                  label="Género"
                  name="gender"
                  options={genderOptions}
                  placeholder="Selecciona una opción"
                  required
                />
              </div>

              <PolicyCheckbox
                occurrenceId={occurrenceId}
                checked={acceptsPolicy}
                onChange={setAcceptsPolicy}
                disabled={isSubmitting}
              />

              <DialogFooter>
                <Button type="submit" disabled={!acceptsPolicy || isSubmitting}>
                  {isSubmitting ? "Inscribiendo..." : "Confirmar inscripción"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** No refund wording: a free session has nothing to refund. */
function PolicyCheckbox({
  occurrenceId,
  checked,
  onChange,
  disabled,
}: {
  occurrenceId: number;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Label
      htmlFor={`policy-${occurrenceId}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3"
    >
      <Checkbox
        id={`policy-${occurrenceId}`}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="text-sm font-normal">
        Entiendo que puedo cancelar mi inscripción hasta dos días antes de la
        sesión. Si no puedo asistir, debo liberar el cupo que reservé.
      </span>
    </Label>
  );
}

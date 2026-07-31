"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
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
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { startPaidCheckout } from "@/app/lib/programs/checkout-actions";
import { formatMoney } from "@/app/lib/programs/pricing";
import { genderOptions } from "@/app/lib/utils";

type Props = {
  occurrenceId: number;
  programSlug: string;
  sessionSlug: string;
  sessionTitle: string;
  scheduleLabel: string;
  isSignedIn: boolean;
  price: number;
  /** Null when availability could not be resolved for this occurrence. */
  seatsRemaining: number | null;
};

const guestSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre completo"),
  email: z.string().trim().email("El correo no es válido"),
  phone: phoneValidator(),
  gender: z.enum(["male", "female", "non_binary", "other", "undisclosed"]),
  birthdate: birthdateValidator({}),
});

type GuestInput = z.input<typeof guestSchema>;
type GuestValues = z.output<typeof guestSchema>;

/**
 * Opens the hold-and-voucher flow already enforced by `startPaidCheckout`.
 * The price is presentation only; the server resolves it again after locking
 * the occurrence, so a stale tab can never submit a stale amount.
 */
export default function PaidRegistrationForm({
  occurrenceId,
  programSlug,
  sessionSlug,
  sessionTitle,
  scheduleLabel,
  isSignedIn,
  price,
  seatsRemaining,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  /** Same event names and shape as the free form, separated by `is_free`. */
  const funnelProperties = {
    occurrence_id: occurrenceId,
    program_slug: programSlug,
    session_slug: sessionSlug,
    session_title: sessionTitle,
    is_free: false,
    is_signed_in: isSignedIn,
    price,
    seats_remaining: seatsRemaining,
  };

  /** See the free form: separates "never tried" from "tried and failed". */
  const submittedRef = useRef(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      submittedRef.current = false;
      posthog.capture(
        POSTHOG_EVENTS.PROGRAM_REGISTRATION_STARTED,
        funnelProperties,
      );
      return;
    }

    if (!submittedRef.current) {
      posthog.capture(POSTHOG_EVENTS.PROGRAM_REGISTRATION_ABANDONED, {
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
    // The consent actually given. See the free form for why the guard is here
    // rather than relying on the disabled button alone.
    if (!acceptsPolicy) {
      toast.error("Confirma que entiendes la política para continuar");
      return;
    }

    submittedRef.current = true;
    posthog.capture(POSTHOG_EVENTS.PROGRAM_REGISTRATION_SUBMITTED, {
      ...funnelProperties,
      is_guest: guest !== null,
    });

    setIsSubmitting(true);
    try {
      const result = await startPaidCheckout({
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
        posthog.capture(POSTHOG_EVENTS.PROGRAM_REGISTRATION_FAILED, {
          ...funnelProperties,
          is_guest: guest !== null,
          failure: "rejected",
          reason: result.message,
        });
        toast.error(result.message);
        return;
      }

      posthog.capture(POSTHOG_EVENTS.PROGRAM_REGISTRATION_COMPLETED, {
        ...funnelProperties,
        is_guest: guest !== null,
        purchase_id: result.purchaseId,
        total_amount: result.totalAmount,
      });
      toast.success(result.message);
      setOpen(false);
      router.push(
        `/programs/purchases/${result.purchaseId}?token=${result.accessToken}`,
      );
    } catch (error) {
      posthog.capture(POSTHOG_EVENTS.PROGRAM_REGISTRATION_FAILED, {
        ...funnelProperties,
        is_guest: guest !== null,
        failure: "exception",
        reason: error instanceof Error ? error.message : "unknown",
      });
      toast.error("No pudimos reservar tu cupo. Intenta de nuevo.");
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
          Reservar - {formatMoney(price)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sessionTitle}</DialogTitle>
          <DialogDescription>
            {scheduleLabel} - {formatMoney(price)}
          </DialogDescription>
        </DialogHeader>

        {isSignedIn ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Reservaremos tu cupo por unos minutos para que subas el
              comprobante de pago.
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
                {isSubmitting
                  ? "Reservando..."
                  : `Reservar por ${formatMoney(price)}`}
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
                description="Ahí te enviamos la confirmación y tu entrada."
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
                  {isSubmitting
                    ? "Reservando..."
                    : `Reservar por ${formatMoney(price)}`}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
      htmlFor={`paid-policy-${occurrenceId}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3"
    >
      <Checkbox
        id={`paid-policy-${occurrenceId}`}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="text-sm font-normal">
        Entiendo que el pago no es reembolsable y que la reserva de mi cupo
        depende de que el pago sea confirmado.
      </span>
    </Label>
  );
}

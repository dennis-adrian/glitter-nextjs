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
import { startPaidCheckout } from "@/app/lib/programs/checkout-actions";
import { formatMoney } from "@/app/lib/programs/pricing";
import { genderOptions } from "@/app/lib/utils";

type Props = {
  occurrenceId: number;
  sessionTitle: string;
  scheduleLabel: string;
  isSignedIn: boolean;
  price: number;
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
  sessionTitle,
  scheduleLabel,
  isSignedIn,
  price,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
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
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setOpen(false);
      router.push(
        `/programs/purchases/${result.purchaseId}?token=${result.accessToken}`,
      );
    } catch {
      toast.error("No pudimos reservar tu cupo. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function onGuestSubmit(event: FormEvent<HTMLFormElement>) {
    return form.handleSubmit((values) => submit(values))(event);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="rounded-full bg-[#9347f5] px-5 font-black text-white hover:bg-[#7f36dc]"
        >
          Reservar · {formatMoney(price)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sessionTitle}</DialogTitle>
          <DialogDescription>
            {scheduleLabel} · {formatMoney(price)}
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
        Entiendo que puedo cancelar hasta dos días antes, que la cancelación no
        genera reembolso y que mi cupo se confirma al validar el comprobante.
      </span>
    </Label>
  );
}

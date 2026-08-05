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
import SessionPriceTransition from "@/app/components/programs/session-price-transition";
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
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Form } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { startPaidCheckout } from "@/app/lib/programs/checkout-actions";
import {
  previewProgramPromoCode,
  type PromoCodePreviewResult,
} from "@/app/lib/programs/promo-code-actions";
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
  previousPrice?: number | null;
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
  previousPrice,
  seatsRemaining,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<Extract<
    PromoCodePreviewResult,
    { success: true }
  > | null>(null);
  const [pendingHigherPromo, setPendingHigherPromo] = useState<Extract<
    PromoCodePreviewResult,
    { success: true }
  > | null>(null);
  const [acceptsHigherPromoPrice, setAcceptsHigherPromoPrice] = useState(false);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [higherPriceDrawerOpen, setHigherPriceDrawerOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
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
      captureClientEvent(
        POSTHOG_EVENTS.PROGRAM_REGISTRATION_STARTED,
        funnelProperties,
      );
      return;
    }

    setHigherPriceDrawerOpen(false);
    setPendingHigherPromo(null);

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
    captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_SUBMITTED, {
      ...funnelProperties,
      is_guest: guest !== null,
    });

    setIsSubmitting(true);
    try {
      const result = await startPaidCheckout({
        occurrenceId,
        acceptsNoRefundPolicy: acceptsPolicy,
        idempotencyKey: ensureIdempotencyKey(),
        promoCode: appliedPromo?.code,
        acceptsHigherPromoPrice,
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
        total_amount: result.totalAmount,
        promo_applied: appliedPromo !== null,
        promo_id: appliedPromo?.promoCodeId ?? null,
      });
      toast.success(result.message);
      setOpen(false);
      router.push(
        `/programs/purchases/${result.purchaseId}?token=${result.accessToken}`,
      );
    } catch {
      // No `reason`: see the voucher card — an arbitrary throw message is
      // unbounded cardinality, and `capture_exceptions` already has the stack.
      captureClientEvent(POSTHOG_EVENTS.PROGRAM_REGISTRATION_FAILED, {
        ...funnelProperties,
        is_guest: guest !== null,
        failure: "exception",
      });
      toast.error("No pudimos reservar tu cupo. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function applyPromoCode() {
    if (!promoCode.trim()) {
      toast.error("Escribe un código promocional");
      return;
    }

    setIsApplyingPromo(true);
    try {
      const result = await previewProgramPromoCode({
        occurrenceId,
        code: promoCode,
      });
      if (!result.success) {
        setAppliedPromo(null);
        setAcceptsHigherPromoPrice(false);
        toast.error(result.message);
        return;
      }

      if (result.isHigherThanExisting) {
        setPendingHigherPromo(result);
        setHigherPriceDrawerOpen(true);
        return;
      }

      setAppliedPromo(result);
      setPendingHigherPromo(null);
      setAcceptsHigherPromoPrice(false);
      toast.success(`Código aplicado: ${formatMoney(result.promoPrice)}`);
    } catch {
      toast.error("No pudimos revisar el código. Intenta de nuevo.");
    } finally {
      setIsApplyingPromo(false);
    }
  }

  function keepExistingPrice() {
    setAppliedPromo(null);
    setPendingHigherPromo(null);
    setAcceptsHigherPromoPrice(false);
    setPromoCode("");
    setHigherPriceDrawerOpen(false);
  }

  function acceptHigherPromo() {
    if (!pendingHigherPromo) return;
    setAppliedPromo(pendingHigherPromo);
    setAcceptsHigherPromoPrice(true);
    setPendingHigherPromo(null);
    setHigherPriceDrawerOpen(false);
  }

  const payablePrice = appliedPromo?.promoPrice ?? price;
  const comparisonPrice = appliedPromo?.basePrice ?? previousPrice;

  const promoSection = (
    <div className="grid gap-2 rounded-xl border border-[#9347f5]/20 bg-[#fffaf3] p-3">
      <Label htmlFor={`promo-${occurrenceId}`}>Código promocional</Label>
      <div className="flex gap-2">
        <Input
          id={`promo-${occurrenceId}`}
          value={promoCode}
          onChange={(event) => {
            setPromoCode(event.target.value.toUpperCase());
            setAppliedPromo(null);
            setAcceptsHigherPromoPrice(false);
          }}
          placeholder="ARTISTA50"
          className="uppercase"
          maxLength={32}
          disabled={isSubmitting || isApplyingPromo}
        />
        <Button
          type="button"
          variant="outline"
          onClick={applyPromoCode}
          disabled={isSubmitting || isApplyingPromo}
        >
          {isApplyingPromo ? "Revisando…" : "Aplicar"}
        </Button>
      </div>
      {appliedPromo ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 rounded-lg bg-[#dff7f3] px-3 py-2 text-[#4b255f]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide">
              {appliedPromo.discountPercent}% · {appliedPromo.partnerName}
            </p>
            <p className="text-xs opacity-75">Código {appliedPromo.code}</p>
          </div>
          <dl className="grid gap-0.5 text-right">
            <div className="flex items-baseline justify-end gap-1.5 text-xs opacity-70">
              <dt>Precio base</dt>
              <dd className="line-through">
                {formatMoney(appliedPromo.basePrice)}
              </dd>
            </div>
            <div className="flex items-baseline justify-end gap-1.5">
              <dt className="text-xs font-semibold">Con código</dt>
              <dd className="text-xl font-black">
                {formatMoney(appliedPromo.promoPrice)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          El porcentaje se calcula sobre el precio público, sin acumular
          descuentos.
        </p>
      )}
    </div>
  );

  function onGuestSubmit(event: FormEvent<HTMLFormElement>) {
    return form.handleSubmit((values) => submit(values))(event);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-auto min-h-9 flex gap-1 w-full whitespace-normal rounded-full bg-[#9347f5] px-5 py-2 text-center font-black text-white hover:bg-[#7f36dc] @[44rem]:w-auto"
        >
          Reservar por{" "}
          <SessionPriceTransition
            price={payablePrice}
            previousPrice={comparisonPrice}
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sessionTitle}</DialogTitle>
          <DialogDescription>
            {scheduleLabel} ·{" "}
            <SessionPriceTransition
              price={payablePrice}
              previousPrice={comparisonPrice}
            />
          </DialogDescription>
        </DialogHeader>

        {isSignedIn ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Reservaremos tu cupo por unos minutos para que subas el
              comprobante de pago.
            </p>
            {promoSection}
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
                className="flex gap-1"
              >
                {isSubmitting ? "Reservando..." : "Reservar por"}
                {!isSubmitting ? (
                  <SessionPriceTransition
                    price={payablePrice}
                    previousPrice={comparisonPrice}
                  />
                ) : null}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form className="grid gap-4" onSubmit={onGuestSubmit}>
              {promoSection}
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
                <Button
                  type="submit"
                  disabled={!acceptsPolicy || isSubmitting}
                  className="flex gap-1"
                >
                  {isSubmitting ? "Reservando..." : "Reservar por "}
                  {!isSubmitting ? (
                    <SessionPriceTransition
                      price={payablePrice}
                      previousPrice={comparisonPrice}
                    />
                  ) : null}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>

      <DrawerDialog
        isDesktop={isDesktop}
        open={higherPriceDrawerOpen}
        onOpenChange={setHigherPriceDrawerOpen}
      >
        <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
          <DrawerDialogHeader isDesktop={isDesktop}>
            <DrawerDialogTitle isDesktop={isDesktop}>
              Este código sube el precio
            </DrawerDialogTitle>
            <DrawerDialogDescription isDesktop={isDesktop}>
              {pendingHigherPromo ? (
                <>
                  El {pendingHigherPromo.discountPercent}% se calcula sobre el
                  precio público de {formatMoney(pendingHigherPromo.basePrice)}{" "}
                  y reemplaza tu descuento actual.
                </>
              ) : null}
            </DrawerDialogDescription>
          </DrawerDialogHeader>

          {pendingHigherPromo ? (
            <div className={isDesktop ? "grid gap-4" : "grid gap-4 px-4 pb-6"}>
              <div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border border-[#4b255f]/15 text-[#4b255f]">
                <div className="bg-[#dff7f3] p-4">
                  <p className="text-xs font-black uppercase tracking-wide">
                    Precio actual
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {formatMoney(pendingHigherPromo.existingPrice)}
                  </p>
                </div>
                <div className="grid place-content-center bg-[#ffc1fd]/45 px-4 text-center">
                  <p className="text-xs font-bold">Código</p>
                  <p className="text-xl font-black">
                    {formatMoney(pendingHigherPromo.promoPrice)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Con {pendingHigherPromo.code}, pagarías{" "}
                {formatMoney(pendingHigherPromo.differenceFromExisting)} más.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={keepExistingPrice}
                >
                  Mantener {formatMoney(pendingHigherPromo.existingPrice)}
                </Button>
                <Button type="button" onClick={acceptHigherPromo}>
                  Aplicar código · {formatMoney(pendingHigherPromo.promoPrice)}
                </Button>
              </div>
            </div>
          ) : null}
        </DrawerDialogContent>
      </DrawerDialog>
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

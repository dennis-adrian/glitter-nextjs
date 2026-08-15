"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Form } from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import { FAST_PASS_MAX_CHILDREN_PER_ADULT } from "@/app/lib/fast-pass/definitions";
import { startFastPassCheckout } from "@/app/lib/fast-pass/checkout-actions";
import { formatMoney } from "@/app/lib/programs/pricing";
import { genderOptions } from "@/app/lib/utils";

const holderSchema = z.object({
  firstName: z.string().trim().min(1, "Escribe el nombre"),
  lastName: z.string().trim().min(1, "Escribe el apellido"),
  email: z.string().trim().email("Correo inválido"),
  phone: phoneValidator(),
  gender: z.enum(["male", "female", "non_binary", "other", "undisclosed"]),
  birthdate: birthdateValidator({}).refine((date) => {
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setFullYear(cutoff.getFullYear() - 11);
    return date <= cutoff;
  }, "Cada titular debe tener 11 años o más"),
  responsibleChildCount: z.coerce
    .number()
    .int()
    .min(0)
    .max(FAST_PASS_MAX_CHILDREN_PER_ADULT),
});

const checkoutSchema = z.object({
  buyerName: z.string().trim().min(2, "Escribe tu nombre completo"),
  buyerEmail: z.string().trim().email("Correo inválido"),
  buyerPhone: phoneValidator(),
  holders: z.array(holderSchema).min(1, "Agrega al menos un titular"),
});

type CheckoutInput = z.input<typeof checkoutSchema>;
type CheckoutValues = z.output<typeof checkoutSchema>;

type Props = {
  festivalDateId: number;
  festivalDateLabel: string;
  price: number;
  maxPaidPasses: number;
  remainingPaid: number | null;
};

export default function FastPassCheckoutForm({
  festivalDateId,
  festivalDateLabel,
  price,
  maxPaidPasses,
  remainingPaid,
}: Props) {
  const router = useRouter();
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const effectiveMax =
    remainingPaid !== null
      ? Math.min(maxPaidPasses, remainingPaid)
      : maxPaidPasses;

  const form = useForm<CheckoutInput, unknown, CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      buyerName: "",
      buyerEmail: "",
      buyerPhone: "",
      holders: [
        {
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          gender: "undisclosed",
          birthdate: "",
          responsibleChildCount: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "holders",
  });

  const holderCount = fields.length;
  const childCount = form
    .watch("holders")
    .reduce(
      (sum, holder) => sum + (Number(holder.responsibleChildCount) || 0),
      0,
    );
  const totalAmount = holderCount * price;

  async function onSubmit(values: CheckoutValues) {
    if (!acceptsPolicy) {
      toast.error("Debes aceptar las condiciones del Pase Rápido");
      return;
    }

    if (holderCount > effectiveMax) {
      toast.error(`Máximo ${effectiveMax} pase(s) por compra`);
      return;
    }

    setIsSubmitting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const result = await startFastPassCheckout({
        festivalDateId,
        idempotencyKey: idempotencyKeyRef.current,
        buyerName: values.buyerName,
        buyerEmail: values.buyerEmail,
        buyerPhone: values.buyerPhone,
        holders: values.holders,
        acceptsPolicy: true,
      });

      if (!result.success || !result.accessToken) {
        toast.error(result.message);
        return;
      }

      router.push(
        `/fast-pass/purchases/${result.purchaseId}?token=${result.accessToken}`,
      );
    } catch {
      toast.error("No pudimos iniciar tu compra. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const header = (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">Comprar Pase Rápido</h1>
      <p className="text-sm text-muted-foreground">
        {festivalDateLabel} · {formatMoney(price)} por pase
      </p>
    </header>
  );

  // Sales can stay open while inventory runs out — no titular form to show.
  if (effectiveMax <= 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Pases agotados</CardTitle>
            <CardDescription>
              Ya no quedan Pases Rápidos disponibles para {festivalDateLabel}.
              Puedes ingresar al festival por la fila general.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos del comprador</CardTitle>
              <CardDescription>
                Usaremos estos datos para enviarte el enlace seguro de pago
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <TextInput name="buyerName" label="Nombre" />
              <TextInput
                name="buyerEmail"
                label="Correo"
                type="email"
              />
              <PhoneInput
                name="buyerPhone"
                label="Teléfono"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Titulares del pase</CardTitle>
                  <CardDescription>
                    Un pase por adulto o visitante de 11 años o más
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={holderCount >= effectiveMax}
                  onClick={() =>
                    append({
                      firstName: "",
                      lastName: "",
                      email: "",
                      phone: "",
                      gender: "undisclosed",
                      birthdate: "",
                      responsibleChildCount: 0,
                    })
                  }
                >
                  Agregar titular
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Titular {index + 1}</p>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextInput
                      name={`holders.${index}.firstName`}
                      label="Nombre"
                    />
                    <TextInput
                      name={`holders.${index}.lastName`}
                      label="Apellido"
                    />
                    <TextInput
                      name={`holders.${index}.email`}
                      label="Correo"
                      type="email"
                    />
                    <PhoneInput
                      name={`holders.${index}.phone`}
                      label="Teléfono"
                    />
                    <SelectInput formControl={form.control}
                      name={`holders.${index}.gender`}
                      label="Género"
                      options={genderOptions}
                    />
                    <DateInput formControl={form.control}
                      name={`holders.${index}.birthdate`}
                      label="Fecha de nacimiento"
                    />
                    <TextInput
                      name={`holders.${index}.responsibleChildCount`}
                      label={`Niños de 10 años o menos (máx. ${FAST_PASS_MAX_CHILDREN_PER_ADULT})`}
                      type="number"
                      min={0}
                      max={FAST_PASS_MAX_CHILDREN_PER_ADULT}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Pases pagos</dt>
                  <dd>{holderCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Menores acompañantes</dt>
                  <dd>{childCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="text-lg font-semibold">
                    {formatMoney(totalAmount)}
                  </dd>
                </div>
              </dl>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="acceptsPolicy"
                  checked={acceptsPolicy}
                  onCheckedChange={(checked) =>
                    setAcceptsPolicy(checked === true)
                  }
                />
                <Label htmlFor="acceptsPolicy" className="text-sm leading-snug">
                  Acepto las condiciones del Pase Rápido y entiendo que el
                  ingreso está sujeto al aforo del recinto y controles de
                  seguridad.
                </Label>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Reservando…" : "Continuar al pago"}
              </Button>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}

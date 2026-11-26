"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { resetCredentialRules, saveCredentialRules } from "@/app/lib/credentials/actions";
import { buildView } from "@/app/lib/credentials/calculate";
import {
  CATEGORY_CREDENTIAL_GROUPS,
  CREDENTIAL_GROUP_BADGE,
  CREDENTIAL_GROUP_LABELS,
  CREDENTIAL_NAMING_MODE_LABELS,
  CREDENTIAL_NAMING_MODES,
  CREDENTIAL_RULE_QUANTITY_MAX,
  CREDENTIALS_COPY,
  DEFAULT_CREDENTIAL_RULES,
  type CategoryCredentialGroup,
  type CredentialFilters,
  type CredentialNamingMode,
  type CredentialRules,
} from "@/app/lib/credentials/definitions";
import {
  credentialRulesFormSchema,
  type CredentialRulesFormInput,
  type CredentialRulesFormValues,
} from "@/app/lib/credentials/schema";
import { toastActionError } from "@/app/lib/errors/action-error";

/** The preview counts confirmed reservations and every group, as M4 says. */
const PREVIEW_FILTERS: CredentialFilters = {
  statuses: { verification_payment: false, pending: false },
  groups: { external: true, volunteer: true, staff: true },
};

export function rulesToForm(rules: CredentialRules): CredentialRulesFormInput {
  return {
    illustration: { ...rules.illustration },
    entrepreneurship: { ...rules.entrepreneurship },
    gastronomy: { ...rules.gastronomy },
    external: { quantity: rules.external.quantity },
    volunteer: { quantity: rules.volunteer.quantity },
    staff: { quantity: rules.staff.quantity },
  };
}

/** The form's values as rules, while they are being typed. */
function formToRules(
  values: CredentialRulesFormInput,
  fallback: CredentialRules,
): CredentialRules {
  const read = (raw: unknown, previous: number) => {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= CREDENTIAL_RULE_QUANTITY_MAX
      ? value
      : previous;
  };
  const category = (group: CategoryCredentialGroup) => ({
    quantity: read(values[group]?.quantity, fallback[group].quantity),
    namingMode:
      (values[group]?.namingMode as CredentialNamingMode | undefined) ??
      fallback[group].namingMode,
  });
  return {
    illustration: category("illustration"),
    entrepreneurship: category("entrepreneurship"),
    gastronomy: category("gastronomy"),
    external: {
      quantity: read(values.external?.quantity, fallback.external.quantity),
      namingMode: "all_named",
    },
    volunteer: {
      quantity: read(values.volunteer?.quantity, fallback.volunteer.quantity),
      namingMode: "all_named",
    },
    staff: {
      quantity: read(values.staff?.quantity, fallback.staff.quantity),
      namingMode: "all_named",
    },
  };
}

function namingHint(group: CategoryCredentialGroup, quantity: number, mode: CredentialNamingMode) {
  if (quantity === 0) return "Sin credenciales para este grupo.";
  switch (mode) {
    case "one_per_participant":
      return group === "illustration"
        ? `Solo en un espacio: 1 con nombre y ${quantity - 1} sin nombre. Dos que comparten: ${Math.min(2, quantity)} con nombre${quantity > 2 ? ` y ${quantity - 2} sin nombre` : ""}.`
        : `Por espacio: 1 con nombre y ${quantity - 1} sin nombre.`;
    case "all_named":
      return `Por espacio: ${quantity} con el nombre del expositor.`;
    case "none":
      return `Por espacio: ${quantity} sin nombre.`;
  }
}

const number = (value: number) => value.toLocaleString("es-BO");

function QuantityField({
  name,
  label,
  description,
}: {
  name: `${keyof CredentialRulesFormInput}.quantity`;
  label: string;
  description: string;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="flex min-w-0 flex-col gap-2 space-y-0">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={CREDENTIAL_RULE_QUANTITY_MAX}
              className="w-24"
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <FormDescription className="break-words">{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Reglas (M4): per-festival rules, saved with a button. The side card
 * previews the totals with the values being edited, through the same
 * calculator as the rest of the page.
 */
export default function CredentialsRulesForm() {
  const { festivalId, rules, data } = useCredentials();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const form = useForm<CredentialRulesFormInput, unknown, CredentialRulesFormValues>({
    resolver: zodResolver(credentialRulesFormSchema),
    defaultValues: rulesToForm(rules),
  });
  const watched = useWatch({ control: form.control }) as CredentialRulesFormInput;
  const previewRules = formToRules(watched, rules);
  const preview = buildView(data, previewRules, PREVIEW_FILTERS);
  const groupTotal = (group: CategoryCredentialGroup) =>
    preview.summary.rows.find((row) => row.group === group)?.total ?? 0;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await saveCredentialRules({ festivalId, rules: values });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      form.reset(values);
      router.refresh();
    } catch (error) {
      toastActionError(error, CREDENTIALS_COPY.genericError);
    }
  });

  async function onReset() {
    setResetting(true);
    try {
      const result = await resetCredentialRules({ festivalId });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      form.reset(rulesToForm(DEFAULT_CREDENTIAL_RULES));
      router.refresh();
    } catch (error) {
      toastActionError(error, CREDENTIALS_COPY.genericError);
    } finally {
      setResetting(false);
    }
  }

  const busy = form.formState.isSubmitting || resetting;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_35rem] flex-col gap-6">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Por categoría</CardTitle>
              <CardDescription>
                Cuántas credenciales corresponden a cada espacio según su categoría. Valen solo
                para esta edición.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y p-0">
              {CATEGORY_CREDENTIAL_GROUPS.map((group) => {
                const quantity = previewRules[group].quantity;
                const mode = previewRules[group].namingMode;
                return (
                  <fieldset
                    key={group}
                    className="flex min-w-0 flex-col gap-4 px-4 py-5 md:px-6"
                    aria-label={CREDENTIAL_GROUP_LABELS[group]}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Badge variant={CREDENTIAL_GROUP_BADGE[group]}>
                        {CREDENTIAL_GROUP_LABELS[group]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {number(groupTotal(group))} credenciales con las reservas confirmadas
                      </span>
                    </div>
                    <div className="grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                      <QuantityField
                        name={`${group}.quantity`}
                        label="Credenciales por espacio"
                        description={`Una reserva con 2 espacios recibe ${number(quantity * 2)}.`}
                      />
                      <FormField
                        name={`${group}.namingMode`}
                        render={({ field }) => (
                          <FormItem className="flex min-w-0 flex-col gap-2 space-y-0">
                            <FormLabel>Cuáles llevan nombre</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger className="min-w-0">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CREDENTIAL_NAMING_MODES.map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {CREDENTIAL_NAMING_MODE_LABELS[value]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription className="break-words">
                              {namingHint(group, quantity, mode)}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </fieldset>
                );
              })}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="text-lg">Otros grupos</CardTitle>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-5 sm:grid-cols-3">
              <QuantityField
                name="external.quantity"
                label="Participante externo, por espacio"
                description="Con el nombre de la organización. Se ajusta una por una en Equipo y externos."
              />
              <QuantityField
                name="volunteer.quantity"
                label="Voluntario aceptado"
                description="Con nombre y rol asignado."
              />
              <QuantityField
                name="staff.quantity"
                label="Persona del equipo Glitter"
                description="Con nombre y rol."
              />
            </CardContent>
            <CardFooter className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                wrap
                disabled={busy}
                onClick={onReset}
              >
                Volver a los valores por defecto
              </Button>
              <Button type="submit" wrap disabled={busy}>
                {form.formState.isSubmitting ? "Guardando..." : "Guardar reglas"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Con estas reglas</CardTitle>
              <CardDescription>Sobre las reservas confirmadas y todos los grupos.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2" aria-live="polite">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Con nombre</dt>
                  <dd className="tabular-nums">{number(preview.summary.named)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Sin nombre</dt>
                  <dd className="tabular-nums">{number(preview.summary.unnamed)}</dd>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between gap-3 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums" data-testid="rules-preview-total">
                    {number(preview.summary.total)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Alert>
            <InfoIcon className="h-4 w-4" aria-hidden />
            <AlertTitle>Los participantes ven estas reglas</AlertTitle>
            <AlertDescription>
              La ficha de cada sector y el detalle del pago les dicen cuántas credenciales
              reciben. Al guardar, ese texto se actualiza con los mismos números.
            </AlertDescription>
          </Alert>
          <p className="text-xs text-muted-foreground">
            Valores por defecto: 2 credenciales por espacio en todas las categorías. En
            ilustración y emprendimiento, una con nombre por participante y el resto sin nombre;
            en gastronomía, todas con el nombre del expositor. Siempre se cuenta por espacio: una
            reserva con 2 espacios recibe el doble.
          </p>
        </div>
      </form>
    </Form>
  );
}

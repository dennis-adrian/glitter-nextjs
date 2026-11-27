"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
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
import { cn } from "@/app/lib/utils";

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
    // A cleared field is refused on save (schema.ts), so the preview keeps
    // the last value rather than showing it as 0.
    if (typeof raw === "string" && raw.trim() === "") return previous;
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

type RuleField = FieldPath<CredentialRulesFormInput>;

const RULE_FIELDS: RuleField[] = [
  ...CATEGORY_CREDENTIAL_GROUPS.flatMap(
    (group) => [`${group}.quantity`, `${group}.namingMode`] as const,
  ),
  "external.quantity",
  "volunteer.quantity",
  "staff.quantity",
];

/** A field's value in form input, whatever its source. */
function readField(values: unknown, path: RuleField) {
  const [group, key] = path.split(".") as [string, string];
  return (values as Record<string, Record<string, unknown> | undefined> | undefined)?.[group]?.[
    key
  ];
}

/** Inputs hold what is typed ("4"), saved rules hold numbers (4). */
const sameValue = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

const UNSAVED_CLASS = "border-amber-500 dark:border-amber-400";

function QuantityField({
  name,
  label,
  description,
  unsaved = false,
}: {
  name: `${keyof CredentialRulesFormInput}.quantity`;
  label: string;
  description: string;
  /** A draft kept over newer saved rules, still waiting for review. */
  unsaved?: boolean;
}) {
  return (
    <FormField
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className="flex min-w-0 flex-col gap-2 space-y-0">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={CREDENTIAL_RULE_QUANTITY_MAX}
              className={cn("w-24", unsaved && UNSAVED_CLASS)}
              {...field}
              aria-invalid={fieldState.invalid || unsaved}
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
  // Drafts kept over a refresh that changed them underneath (`conflicts`),
  // and those already refused once by Guardar and marked (`reviewing`).
  const [conflicts, setConflicts] = useState<RuleField[]>([]);
  const [reviewing, setReviewing] = useState<RuleField[]>([]);

  // `defaultValues` is read once, so a refresh with newer rules (another
  // admin saved or reset them) is followed by hand: untouched fields take
  // the new values; edited ones are kept, but saving them as they are would
  // silently undo the newer rules, so they are flagged for review.
  const rulesKey = JSON.stringify(rules);
  const seenRulesKey = useRef(rulesKey);
  useEffect(() => {
    if (seenRulesKey.current === rulesKey) return;
    seenRulesKey.current = rulesKey;
    const next = rulesToForm(rules);
    const previous = form.formState.defaultValues;
    const current = form.getValues();
    const kept = RULE_FIELDS.filter((path) => {
      const value = readField(current, path);
      return (
        !sameValue(value, readField(previous, path)) && !sameValue(value, readField(next, path))
      );
    });
    form.reset(next);
    for (const path of kept) {
      form.setValue(path, readField(current, path) as never, { shouldDirty: true });
    }
    setConflicts(kept);
    setReviewing((list) => list.filter((path) => kept.includes(path)));
  }, [rulesKey, rules, form]);

  const watched = useWatch({ control: form.control }) as CredentialRulesFormInput;
  // Marked until saved or dropped, so it never reads as saved once the
  // warning closes.
  const unsaved = (path: RuleField) =>
    reviewing.includes(path) &&
    !sameValue(readField(watched, path), readField(form.formState.defaultValues, path));
  const previewRules = formToRules(watched, rules);
  const preview = buildView(data, previewRules, PREVIEW_FILTERS);
  const groupTotal = (group: CategoryCredentialGroup) =>
    preview.summary.rows.find((row) => row.group === group)?.total ?? 0;

  function keepSavedRules(paths: RuleField[]) {
    for (const path of paths) form.resetField(path);
    setReviewing([]);
  }

  // The rules the form takes as saved, the same ones the conflict check
  // compares against: the server refuses a save or reset if they are no
  // longer the festival's, so a form that missed a refresh cannot undo
  // another admin's rules. Its own save resets them to what it saved.
  const baseRules = () => form.formState.defaultValues as CredentialRulesFormInput;

  const save = form.handleSubmit(async (values) => {
    try {
      const result = await saveCredentialRules({
        festivalId,
        rules: values,
        baseRules: baseRules(),
      });
      if (!result.success) {
        toast.error(result.message);
        // Newer rules (a stale base) reach the form through its refresh
        // effect, which keeps and flags the drafts; a reload would drop them.
        router.refresh();
        return;
      }
      toast.success(result.message);
      setConflicts([]);
      setReviewing([]);
      form.reset(values);
      router.refresh();
    } catch (error) {
      toastActionError(error, CREDENTIALS_COPY.genericError);
    }
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const changed = conflicts.filter(
      (path) =>
        !sameValue(form.getValues(path), readField(form.formState.defaultValues, path)),
    );
    if (changed.length > 0) {
      // Refused once, so the admin sees the newer rules before replacing them.
      event.preventDefault();
      setConflicts([]);
      setReviewing(changed);
      toast.warning(
        "Mientras editabas, cambiaron las reglas guardadas. Revisá los campos marcados y guardá de nuevo si querés reemplazarlas.",
        {
          duration: 15_000,
          action: { label: "Usar las guardadas", onClick: () => keepSavedRules(changed) },
        },
      );
      return;
    }
    setConflicts([]);
    return save(event);
  }

  async function onReset() {
    setResetting(true);
    try {
      const result = await resetCredentialRules({ festivalId, baseRules: baseRules() });
      if (!result.success) {
        toast.error(result.message);
        // Newer rules (a stale base) reach the form through its refresh
        // effect, which keeps and flags the drafts; a reload would drop them.
        router.refresh();
        return;
      }
      toast.success(result.message);
      setConflicts([]);
      setReviewing([]);
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
        {/* Locked while saving or resetting: each ends by resetting the form
            to what it saved, which would drop an edit made meanwhile. */}
        <fieldset
          disabled={busy}
          className="flex min-w-0 flex-[999_1_35rem] flex-col gap-6"
        >
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
                        unsaved={unsaved(`${group}.quantity`)}
                      />
                      <FormField
                        name={`${group}.namingMode`}
                        render={({ field, fieldState }) => (
                          <FormItem className="flex min-w-0 flex-col gap-2 space-y-0">
                            <FormLabel>Cuáles llevan nombre</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger
                                  className={cn(
                                    "min-w-0",
                                    unsaved(`${group}.namingMode`) && UNSAVED_CLASS,
                                  )}
                                  aria-invalid={
                                    fieldState.invalid || unsaved(`${group}.namingMode`)
                                  }
                                >
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
                unsaved={unsaved("external.quantity")}
              />
              <QuantityField
                name="volunteer.quantity"
                label="Voluntario aceptado"
                description="Con nombre y rol asignado."
                unsaved={unsaved("volunteer.quantity")}
              />
              <QuantityField
                name="staff.quantity"
                label="Persona del equipo Glitter"
                description="Con nombre y rol."
                unsaved={unsaved("staff.quantity")}
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
        </fieldset>

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
            ilustración y emprendimiento, una con nombre por participante hasta completar las de la reserva y el resto sin nombre;
            en gastronomía, todas con el nombre del expositor. Siempre se cuenta por espacio: una
            reserva con 2 espacios recibe el doble.
          </p>
        </div>
      </form>
    </Form>
  );
}

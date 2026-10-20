"use client";

import ComboboxInput from "@/app/components/form/fields/combobox";
import DateInput from "@/app/components/form/fields/date";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import AssignedUsersPicker from "@/app/components/organisms/discount_codes/assigned-users-picker";
import {
  buildDiscountCodeFormSchema,
  discountCodeFormDefaults,
  toDiscountCodeInput,
  type DiscountCodeFormValues,
} from "@/app/components/organisms/discount_codes/discount-code-form-schema";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Switch } from "@/app/components/ui/switch";
import {
  createDiscountCode,
  updateDiscountCode,
} from "@/app/lib/discount_codes/actions";
import type {
  DiscountCodeAudience,
  DiscountCodeWithRelations,
} from "@/app/lib/discount_codes/definitions";
import {
  MAX_DISCOUNT_CODE_USERS,
  storeDay,
} from "@/app/lib/discount_codes/utils";
import { cn } from "@/app/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

type Option = { label: string; value: string };

type DiscountCodeFormProps = {
  festivalsOptions: Option[];
  discountCode?: DiscountCodeWithRelations;
};

const discountUnitOptions: Option[] = [
  { label: "Porcentaje (%)", value: "percentage" },
  { label: "Monto fijo (Bs)", value: "amount" },
];

const audienceOptions: {
  value: DiscountCodeAudience;
  label: string;
  description: string;
}[] = [
  {
    value: "everyone",
    label: "Cualquier usuario",
    description: "Lo puede aplicar quien tenga el código.",
  },
  {
    value: "selected_users",
    label: "Usuarios específicos",
    description: "Solo funciona en los cobros de las personas que elijas.",
  },
];

const expiryShortcuts = [
  { label: "1 semana", plus: { weeks: 1 } },
  { label: "1 mes", plus: { months: 1 } },
  { label: "1 año", plus: { years: 1 } },
] as const;

export default function DiscountCodeForm({
  festivalsOptions,
  discountCode,
}: DiscountCodeFormProps) {
  const router = useRouter();
  const isEditing = !!discountCode;

  const form = useForm<DiscountCodeFormValues>({
    resolver: zodResolver(buildDiscountCodeFormSchema(discountCode)),
    defaultValues: discountCodeFormDefaults(discountCode),
  });
  const discountUnit = useWatch({
    control: form.control,
    name: "discountUnit",
  });
  const audience = useWatch({ control: form.control, name: "audience" });

  const action = form.handleSubmit(async (values) => {
    const payload = toDiscountCodeInput(values, discountCode);
    const res = isEditing
      ? await updateDiscountCode(discountCode.id, payload)
      : await createDiscountCode(payload);

    if (res.success) {
      toast.success(res.message);
      router.push("/dashboard/discount_codes");
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-5" onSubmit={action} noValidate>
        <TextInput
          label="Código"
          name="code"
          placeholder="EJEMPLO2026"
          className="uppercase"
          autoComplete="off"
          description="Letras, números, guiones o guiones bajos. Mayúsculas y minúsculas valen lo mismo."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            formControl={form.control}
            label="Tipo de descuento"
            name="discountUnit"
            options={discountUnitOptions}
            placeholder="Seleccionar tipo"
          />
          <TextInput
            label={discountUnit === "percentage" ? "Valor (%)" : "Valor (Bs)"}
            name="discountValue"
            type="number"
            inputMode="decimal"
            min="0"
            max={discountUnit === "percentage" ? "100" : undefined}
            step="0.01"
            placeholder="0"
          />
        </div>
        <TextInput
          label="Límite de usos"
          name="maxUses"
          type="number"
          inputMode="numeric"
          min={String(Math.max(1, discountCode?.currentUses ?? 1))}
          step="1"
          placeholder="Sin límite"
          description={
            isEditing
              ? `Vacío = ilimitado. Usado ${discountCode.currentUses} ${discountCode.currentUses === 1 ? "vez" : "veces"} hasta ahora.`
              : "Vacío = ilimitado. Cuenta los usos de todas las personas juntas."
          }
        />
        <ComboboxInput
          form={form}
          label="Festival"
          name="festivalId"
          options={[
            { value: "", label: "Todos los festivales" },
            ...festivalsOptions,
          ]}
          placeholder="Todos los festivales"
          description="Elegí uno para que el código solo aplique a reservas de ese festival."
        />

        <FormField
          control={form.control}
          name="audience"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>¿Quién puede usarlo?</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {audienceOptions.map((option) => {
                    const id = `audience-${option.value}`;
                    const selected = field.value === option.value;
                    return (
                      <Label
                        key={option.value}
                        htmlFor={id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors",
                          selected
                            ? "border-primary bg-primary/5"
                            : "hover:border-foreground/20",
                        )}
                      >
                        <RadioGroupItem
                          id={id}
                          value={option.value}
                          className="mt-0.5"
                        />
                        <span className="grid gap-0.5">
                          <span className="text-sm font-medium">
                            {option.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />

        {audience === "selected_users" && (
          <FormField
            control={form.control}
            name="assignedUsers"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Usuarios</FormLabel>
                <AssignedUsersPicker
                  value={field.value}
                  onChange={(next) =>
                    form.setValue("assignedUsers", next, {
                      shouldDirty: true,
                      shouldValidate: form.formState.isSubmitted,
                    })
                  }
                  max={MAX_DISCOUNT_CODE_USERS}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid gap-2">
          <DateInput
            formControl={form.control}
            label="Válido hasta"
            name="expiresOn"
            min={storeDay()}
            description="Incluido: el código deja de funcionar al terminar ese día (hora de Bolivia)."
          />
          <div className="flex flex-wrap gap-2">
            {expiryShortcuts.map(({ label, plus }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  form.setValue("expiresOn", storeDay(plus), {
                    shouldDirty: true,
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="grid gap-0.5">
                <FormLabel className="mt-0!">Activo</FormLabel>
                <FormDescription>
                  Apagalo para pausar el código sin perder su configuración.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        <SubmitButton
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
          loading={form.formState.isSubmitting}
        >
          {isEditing ? "Guardar cambios" : "Crear código"}
        </SubmitButton>
      </form>
    </Form>
  );
}

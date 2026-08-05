"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Switch } from "@/app/components/ui/switch";
import {
  createProgramPromoCode,
  updateProgramPromoCode,
} from "@/app/lib/programs/promo-code-admin-actions";
import type { ProgramPromoCode } from "@/app/lib/programs/definitions";
import {
  dateOrNull,
  numberOrNull,
  toDateTimeLocal,
} from "@/app/lib/programs/form-schemas";

const formSchema = z.object({
  programId: z.string().trim().min(1, "El programa es obligatorio"),
  code: z
    .string()
    .trim()
    .min(3, "Usa al menos 3 caracteres")
    .max(32, "Usa hasta 32 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Usa letras, números, guiones o guiones bajos"),
  partnerName: z.string().trim().min(1, "El aliado es obligatorio").max(200),
  discountPercent: z.string().trim().min(1, "El porcentaje es obligatorio"),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  maxUses: z.string().optional(),
  internalNotes: z.string().max(1000).optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  programs: { id: number; name: string }[];
  promoCode?: ProgramPromoCode;
  hasRedemptions?: boolean;
  defaultProgramId?: number | null;
};

export default function PromoCodeForm({
  programs,
  promoCode,
  hasRedemptions = false,
  defaultProgramId = null,
}: Props) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      programId: String(promoCode?.programId ?? defaultProgramId ?? ""),
      code: promoCode?.code ?? "",
      partnerName: promoCode?.partnerName ?? "",
      discountPercent: promoCode ? String(promoCode.discountPercent) : "50",
      startsAt: toDateTimeLocal(promoCode?.startsAt),
      expiresAt: toDateTimeLocal(promoCode?.expiresAt),
      maxUses: promoCode?.maxUses ? String(promoCode.maxUses) : "",
      internalNotes: promoCode?.internalNotes ?? "",
      isActive: promoCode?.isActive ?? false,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    const discountPercent = numberOrNull(values.discountPercent);
    const maxUses = numberOrNull(values.maxUses);
    const programId = numberOrNull(values.programId);
    if (!programId || discountPercent === null) {
      toast.error("Revisa el programa y el porcentaje");
      return;
    }

    const payload = {
      programId,
      code: values.code,
      partnerName: values.partnerName,
      discountPercent,
      startsAt: dateOrNull(values.startsAt),
      expiresAt: dateOrNull(values.expiresAt),
      maxUses,
      isActive: values.isActive,
      internalNotes: values.internalNotes?.trim() || null,
    };

    const result = promoCode
      ? await updateProgramPromoCode(promoCode.id, payload)
      : await createProgramPromoCode(payload);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    if ("promoCodeId" in result) {
      router.push(`/dashboard/programs/promo-codes/${result.promoCodeId}`);
    }
    router.refresh();
  });

  return (
    <Form {...form}>
      <form className="grid gap-5" onSubmit={submit}>
        {hasRedemptions ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Este código ya tiene usos. Programa, código, aliado y porcentaje
            quedan fijos; crea otro código para cambiar esos datos.
          </p>
        ) : null}

        <SelectInput
          formControl={form.control}
          label="Programa"
          name="programId"
          options={programs.map((program) => ({
            value: String(program.id),
            label: program.name,
          }))}
          disabled={hasRedemptions}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Código"
            name="code"
            placeholder="ARTISTA50"
            className="uppercase"
            disabled={hasRedemptions}
            required
          />
          <TextInput
            label="Aliado, artista o influencer"
            name="partnerName"
            placeholder="Nombre público"
            disabled={hasRedemptions}
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Descuento (%)"
            name="discountPercent"
            type="number"
            min="1"
            max="100"
            step="1"
            disabled={hasRedemptions}
            required
          />
          <TextInput
            label="Límite de usos"
            name="maxUses"
            type="number"
            min="1"
            step="1"
            placeholder="Sin límite"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="Disponible desde"
            name="startsAt"
            type="datetime-local"
          />
          <TextInput
            label="Disponible hasta"
            name="expiresAt"
            type="datetime-local"
          />
        </div>

        <TextareaInput
          formControl={form.control}
          label="Notas internas"
          name="internalNotes"
          maxLength={1000}
          placeholder="Acuerdo, campaña o contexto para el equipo"
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <FormLabel>Activo</FormLabel>
                <FormDescription>
                  Solo los códigos activos y dentro de sus fechas pueden usarse.
                </FormDescription>
                <FormMessage />
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <SubmitButton disabled={false}>
          {promoCode ? "Guardar cambios" : "Crear código"}
        </SubmitButton>
      </form>
    </Form>
  );
}

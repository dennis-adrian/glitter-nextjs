"use client";

import ComboboxInput from "@/app/components/form/fields/combobox";
import InfractionTypeDescription from "@/app/components/infractions/type-description";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { editInfraction } from "@/app/lib/infractions/actions";
import type { InfractionType } from "@/app/lib/infractions/definitions";
import type { InfractionDetail } from "@/app/lib/infractions/queries";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z
  .object({
    typeId: z.string().min(1),
    festivalId: z.string(),
    description: z.string().max(2000).optional(),
    userGaveNotice: z.boolean(),
    gaveNoticeAt: z.string().optional(),
    reason: z.string().trim().min(1, "Indicá el motivo del cambio").max(1000),
  })
  .superRefine((data, ctx) => {
    if (data.userGaveNotice && !data.gaveNoticeAt) {
      ctx.addIssue({
        code: "custom",
        path: ["gaveNoticeAt"],
        message: "Indicá cuándo el participante dio aviso",
      });
    }

    if (data.gaveNoticeAt) {
      const parsed = DateTime.fromISO(data.gaveNoticeAt, {
        zone: STORE_TIMEZONE,
      });
      if (!parsed.isValid) {
        ctx.addIssue({
          code: "custom",
          path: ["gaveNoticeAt"],
          message: "Fecha de aviso inválida",
        });
      }
    }
  });

export default function EditInfractionForm({
  infraction,
  infractionTypes,
  festivals,
}: {
  infraction: InfractionDetail;
  infractionTypes: InfractionType[];
  festivals: { id: number; name: string }[];
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      typeId: String(infraction.typeId),
      festivalId:
        infraction.festivalId != null ? String(infraction.festivalId) : "none",
      description: infraction.description ?? "",
      userGaveNotice: infraction.userGaveNotice,
      gaveNoticeAt: infraction.gaveNoticeAt
        ? DateTime.fromJSDate(infraction.gaveNoticeAt, {
            zone: STORE_TIMEZONE,
          }).toFormat("yyyy-MM-dd'T'HH:mm")
        : "",
      reason: "",
    },
  });

  const userGaveNotice = useWatch({
    control: form.control,
    name: "userGaveNotice",
  });
  const selectedTypeId = useWatch({
    control: form.control,
    name: "typeId",
  });
  const selectedInfractionType = infractionTypes.find(
    (type) => String(type.id) === selectedTypeId,
  );

  if (infraction.status === "voided") {
    return (
      <p className="text-sm text-muted-foreground">
        Las infracciones anuladas no se pueden editar.
      </p>
    );
  }

  const action = form.handleSubmit(async (data) => {
    const response = await editInfraction({
      infractionId: infraction.id,
      typeId: Number(data.typeId),
      festivalId: data.festivalId === "none" ? null : Number(data.festivalId),
      description: data.description?.trim() || null,
      userGaveNotice: data.userGaveNotice,
      gaveNoticeAt:
        data.userGaveNotice && data.gaveNoticeAt
          ? DateTime.fromISO(data.gaveNoticeAt, {
              zone: STORE_TIMEZONE,
            }).toJSDate()
          : null,
      reason: data.reason,
    });

    if (!response.success) {
      toast.error(response.message);
      return;
    }

    toast.success(response.message);
    form.setValue("reason", "");
    router.refresh();
  });

  return (
    <Form {...form}>
      <form className="space-y-4 rounded-md border p-4" onSubmit={action}>
        <h3 className="font-medium text-sm">Editar infracción</h3>
        <ComboboxInput
          form={form}
          name="typeId"
          label="Tipo"
          placeholder="Tipo"
          options={infractionTypes
            .filter((type) => type.active || type.id === infraction.typeId)
            .map((type) => ({
              value: String(type.id),
              label: type.active ? type.label : `${type.label} (archivado)`,
            }))}
        />
        <InfractionTypeDescription type={selectedInfractionType} />
        <ComboboxInput
          form={form}
          name="festivalId"
          label="Festival"
          placeholder="Festival"
          options={[
            { value: "none", label: "Global" },
            ...festivals.map((festival) => ({
              value: String(festival.id),
              label: festival.name,
            })),
          ]}
        />
        <TextareaInput
          formControl={form.control}
          name="description"
          label="Descripción"
          placeholder="Detalles"
          maxLength={2000}
        />
        <FormField
          control={form.control}
          name="userGaveNotice"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel>¿El participante dio aviso previo?</FormLabel>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    if (checked !== true) form.setValue("gaveNoticeAt", "");
                  }}
                />
                <FormDescription>Aviso previo del participante</FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {userGaveNotice && (
          <FormField
            control={form.control}
            name="gaveNoticeAt"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Fecha del aviso</FormLabel>
                <Input
                  type="datetime-local"
                  {...field}
                  value={field.value ?? ""}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motivo del cambio</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton
          disabled={!form.formState.isDirty || form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          label="Guardar cambios"
        />
      </form>
    </Form>
  );
}

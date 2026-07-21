"use client";

import ComboboxInput from "@/app/components/form/fields/combobox";
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
import { registerInfraction } from "@/app/lib/infractions/actions";
import type { DuplicateInfractionCandidate } from "@/app/lib/infractions/definitions";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z
  .object({
    infractionType: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? "El tipo de infracción requerido"
            : undefined,
      })
      .min(1, {
        error: "El tipo de infracción requerido",
      }),
    description: z.string().max(2000).optional(),
    userGaveNotice: z.boolean(),
    gaveNoticeAt: z.string().optional(),
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

type RegisterInfractionFormProps = {
  participantId: number;
  festivalId: number;
  infractionTypes: InfractionType[];
  onSuccess: () => void;
};

export default function RegisterInfractionForm({
  participantId,
  festivalId,
  infractionTypes,
  onSuccess,
}: RegisterInfractionFormProps) {
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [duplicates, setDuplicates] = useState<DuplicateInfractionCandidate[]>(
    [],
  );
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      description: "",
      userGaveNotice: false,
      gaveNoticeAt: "",
    },
  });

  const userGaveNotice = useWatch({
    control: form.control,
    name: "userGaveNotice",
  });
  const infractionType = useWatch({
    control: form.control,
    name: "infractionType",
  });

  useEffect(() => {
    setDuplicates([]);
    setConfirmDuplicate(false);
  }, [infractionType]);

  const infractionOptions = infractionTypes.map((infraction) => ({
    value: infraction.id.toString(),
    label: infraction.label,
  }));

  const action = form.handleSubmit(async (data) => {
    const { infractionType, userGaveNotice, description, gaveNoticeAt } = data;
    const response = await registerInfraction({
      userId: participantId,
      typeId: Number(infractionType),
      festivalId,
      description: description || undefined,
      userGaveNotice,
      gaveNoticeAt:
        userGaveNotice && gaveNoticeAt
          ? DateTime.fromISO(gaveNoticeAt, { zone: STORE_TIMEZONE }).toJSDate()
          : null,
      idempotencyKey: idempotencyKeyRef.current,
      confirmDuplicate,
    });

    if (response.success) {
      toast.success(response.message);
      idempotencyKeyRef.current = crypto.randomUUID();
      setDuplicates([]);
      setConfirmDuplicate(false);
      onSuccess();
      return;
    }

    if (response.code === "duplicate_warning" && response.duplicates) {
      setDuplicates(response.duplicates);
      toast.warning(response.message);
      return;
    }

    toast.error(response.message);
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4 py-2" onSubmit={action}>
        <ComboboxInput
          form={form}
          name="infractionType"
          options={infractionOptions}
          label="Tipo de infracción"
          placeholder="Selecciona una opción"
        />
        <TextareaInput
          formControl={form.control}
          name="description"
          label="Detalles del incidente"
          placeholder="Descripción opcional del incidente"
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
                    if (checked !== true) {
                      form.setValue("gaveNoticeAt", "");
                    }
                  }}
                />
                <FormDescription>
                  El participante avisó a la organización antes del
                  incumplimiento o incidente
                </FormDescription>
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
                <FormLabel>Fecha y hora del aviso</FormLabel>
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
        {duplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
            <p className="font-medium text-amber-900">
              Posibles infracciones duplicadas (últimas 24 h)
            </p>
            <ul className="list-disc pl-4 space-y-1 text-amber-900">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  #{duplicate.id} · {duplicate.type.label} ·{" "}
                  {formatDate(duplicate.createdAt).toLocaleString(
                    DateTime.DATETIME_MED,
                  )}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 pt-1">
              <Checkbox
                checked={confirmDuplicate}
                onCheckedChange={(checked) =>
                  setConfirmDuplicate(checked === true)
                }
              />
              <span>Confirmo que es un incidente distinto</span>
            </label>
          </div>
        )}
        <SubmitButton
          loading={form.formState.isLoading}
          disabled={
            !form.formState.isDirty ||
            form.formState.isLoading ||
            form.formState.isSubmitting ||
            form.formState.isSubmitSuccessful ||
            (duplicates.length > 0 && !confirmDuplicate)
          }
          label={
            duplicates.length > 0
              ? "Registrar de todos modos"
              : "Registrar infracción"
          }
        />
      </form>
    </Form>
  );
}

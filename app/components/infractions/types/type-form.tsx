"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import {
  createInfractionType,
  updateInfractionType,
} from "@/app/lib/infraction-types/actions";
import {
  createInfractionTypeSchema,
  type CreateInfractionTypeInput,
} from "@/app/lib/infraction-types/schema";
import type { InfractionType } from "@/app/lib/infractions/definitions";
import { infractionSeverityLabel } from "@/app/lib/infractions/mappers";
import { infractionSeverityEnum } from "@/db/schema";

export default function InfractionTypeForm({
  type,
  onSuccess,
}: {
  type?: InfractionType;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const form = useForm<CreateInfractionTypeInput>({
    resolver: zodResolver(createInfractionTypeSchema),
    defaultValues: {
      label: type?.label ?? "",
      description: type?.description ?? "",
      severity: type?.severity ?? "medium",
    },
  });

  const action = form.handleSubmit(async (data) => {
    const result = type
      ? await updateInfractionType({ id: type.id, ...data })
      : await createInfractionType(data);

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    router.refresh();
    onSuccess();
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={action}>
        <TextInput
          name="label"
          label="Nombre"
          placeholder="Nombre visible para los administradores"
          maxLength={120}
          required
        />
        {type && (
          <p className="text-xs text-muted-foreground">
            Código interno: <span className="font-mono">{type.code}</span>. El
            código permanece estable para preservar referencias históricas.
          </p>
        )}
        <SelectInput
          formControl={form.control}
          name="severity"
          label="Severidad"
          placeholder="Seleccioná una severidad"
          required
          options={infractionSeverityEnum.enumValues.map((severity) => ({
            value: severity,
            label: infractionSeverityLabel[severity],
          }))}
        />
        <TextareaInput
          formControl={form.control}
          name="description"
          label="Descripción y situaciones incluidas"
          placeholder="Explicá el tipo e incluí ejemplos para orientar a otros administradores"
          maxLength={2000}
          required
        />
        <p className="text-xs text-muted-foreground">
          Esta descripción se mostrará al seleccionar el tipo al registrar o
          editar una infracción.
        </p>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          label={type ? "Guardar cambios" : "Crear tipo"}
        />
      </form>
    </Form>
  );
}

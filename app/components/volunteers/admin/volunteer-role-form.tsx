"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { toastActionError } from "@/app/lib/errors/action-error";
import { saveVolunteerRole } from "@/app/lib/volunteers/admin-actions";
import {
  VOLUNTEER_ADMIN_COPY,
  type VolunteerAdminRole,
} from "@/app/lib/volunteers/admin-definitions";
import {
  volunteerRoleInputSchema,
  type VolunteerRoleInput,
} from "@/app/lib/volunteers/admin-schema";

type Output = z.output<typeof volunteerRoleInputSchema>;

/** Creates a role, or edits `role` when given. */
export default function VolunteerRoleForm({
  festivalId,
  role,
  nextSortOrder = 0,
  onSaved,
}: {
  festivalId: number;
  role?: VolunteerAdminRole;
  /** The order a new role starts with: after the last one. */
  nextSortOrder?: number;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const defaultValues: VolunteerRoleInput = {
    festivalId,
    roleId: role?.id,
    name: role?.name ?? "",
    description: role?.description ?? "",
    sortOrder: String(role?.sortOrder ?? nextSortOrder),
  };
  const form = useForm<VolunteerRoleInput, unknown, Output>({
    resolver: zodResolver(volunteerRoleInputSchema),
    defaultValues,
  });

  const action = form.handleSubmit(async (values) => {
    try {
      const result = await saveVolunteerRole(values);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      if (!role) {
        form.reset({
          ...defaultValues,
          sortOrder: String(values.sortOrder + 1),
        });
      }
      onSaved?.();
      router.refresh();
    } catch (error) {
      toastActionError(error, VOLUNTEER_ADMIN_COPY.genericError);
    }
  });

  return (
    <Form {...form}>
      <form className="grid min-w-0 gap-4" onSubmit={action} noValidate>
        <div className="grid min-w-0 gap-4 sm:grid-cols-[1fr_8rem]">
          <TextInput label="Nombre" name="name" maxLength={120} required />
          <TextInput
            label="Orden"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
          />
        </div>
        <TextareaInput
          formControl={form.control}
          label="Descripción"
          name="description"
          placeholder="Qué hace este rol durante el festival"
          maxLength={300}
          required
        />
        <SubmitButton
          className="sm:w-auto sm:justify-self-start"
          disabled={form.formState.isSubmitting}
          label={role ? "Guardar rol" : "Agregar rol"}
          submittingLabel="Guardando..."
        />
      </form>
    </Form>
  );
}

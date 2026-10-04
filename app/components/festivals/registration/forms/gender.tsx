"use client";

import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { genderOptions } from "@/app/lib/utils";
import { registerVisitor } from "@/app/lib/visitors/registration-actions";
import type { VisitorRegistrationView } from "@/app/lib/visitors/registration-definitions";
import {
  type VisitorDetails,
  visitorDetailsSchema,
} from "@/app/lib/visitors/visitor-details-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const FormSchema = visitorDetailsSchema.pick({ gender: true });

type GenderFormProps = {
  festivalId: number;
  /** Everything the earlier steps collected. */
  details: Omit<VisitorDetails, "gender">;
  onSuccess: (view: VisitorRegistrationView) => void;
  /** The email step expired: start again from it. */
  onRestart: () => void;
};
export default function GenderForm(props: GenderFormProps) {
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      gender: "other" as const,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await registerVisitor({
      festivalId: props.festivalId,
      mode: "door",
      details: { ...props.details, gender: data.gender },
    });

    if (res.success) {
      toast.success("Guardamos tu información correctamente");
      props.onSuccess(res.view);
      return;
    }

    toast.error(res.message);
    form.setError("root", { message: res.message });
    if (res.restart) props.onRestart();
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={action}>
        <SelectInput
          variant="quiet"
          formControl={form.control}
          name="gender"
          options={genderOptions}
          placeholder="Elige una opción"
          side="top"
        />
        <SubmitButton
          disabled={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
          loading={form.formState.isSubmitting}
        >
          <span>Guardar información</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}

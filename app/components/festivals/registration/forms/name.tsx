"use client";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { visitorDetailsSchema } from "@/app/lib/visitors/visitor-details-schema";

const FormSchema = visitorDetailsSchema.pick({
  firstName: true,
  lastName: true,
});

type NameFormProps = {
  onSubmit: (firstName: string, lastName: string) => void;
};

export default function NameForm(props: NameFormProps) {
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    props.onSubmit(data.firstName, data.lastName);
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid items-start gap-6">
        <div className="grid items-start gap-4">
          <TextInput
            bottomBorderOnly
            name="firstName"
            placeholder="Ingresa tu nombre"
            autoComplete="given-name"
          />
          <TextInput
            bottomBorderOnly
            name="lastName"
            placeholder="Ingresa tu apellido"
            autoComplete="family-name"
          />
        </div>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
        >
          <span>Continuar</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}

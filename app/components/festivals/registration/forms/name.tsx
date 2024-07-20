"use client";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { NewVisitor } from "@/app/data/visitors/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  lastName: z
    .string()
    .trim()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
});

type NameFormProps = {
  onSubmit: (firstName: string, lastName: string) => void;
};

export default function NameForm(props: NameFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
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
            formControl={form.control}
            name="firstName"
            placeholder="Ingresa tu nombre"
          />
          <TextInput
            bottomBorderOnly
            formControl={form.control}
            name="lastName"
            placeholder="Ingresa tu apellido"
          />
        </div>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          <span>Continuar</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}

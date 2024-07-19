import { getMaxDateNumber } from "@/app/components/festivals/registration/forms/helpers";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z
  .object({
    day: z.coerce
      .number({
        invalid_type_error: "El día no es válido",
        required_error: "El día es requerido",
      })
      .min(1, { message: "Mes no válido" }),
    month: z.coerce
      .number({
        invalid_type_error: "El mes no es válido",
        required_error: "El mes es requerido",
      })
      .min(1, { message: "Mes no válido" })
      .max(12, { message: "Mes no válido" }),
    year: z.coerce
      .number({
        invalid_type_error: "El año no es válido",
        required_error: "El año es requerido",
      })
      .min(1900, { message: "El año no puede ser menor a 1900" })
      .max(2015, {
        message: "El año no puede ser mayor a 2015",
      }),
  })
  .refine(
    (data) => {
      const maxDateNumber = getMaxDateNumber(data.month, data.year);
      return data.day <= maxDateNumber;
    },
    {
      message: "El día no es válido",
      path: ["day"],
    },
  );

type BirthdayFormProps = {
  onSubmit: (birthdate: Date) => void;
};

export default function BirthdayForm(props: BirthdayFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const birthdate = new Date(data.year, data.month - 1, data.day);
    props.onSubmit(birthdate);
  });

  return (
    <Form {...form}>
      <form className="flex gap-6 flex-col" onSubmit={action}>
        <div className="flex items-end gap-4">
          <TextInput
            bottomBorderOnly
            messagePosition="top"
            formControl={form.control}
            label="Día"
            name="day"
            placeholder="DD"
            type="number"
            max={31}
          />
          <span className="text-2xl text-muted-foreground">/</span>
          <TextInput
            bottomBorderOnly
            messagePosition="top"
            formControl={form.control}
            label="Mes"
            name="month"
            placeholder="MM"
            type="number"
            max="12"
          />
          <span className="text-2xl text-muted-foreground">/</span>
          <TextInput
            bottomBorderOnly
            messagePosition="top"
            formControl={form.control}
            label="Año"
            name="year"
            placeholder="AAAA"
            type="number"
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

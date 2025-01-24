import {
  getDaysInMonth,
  getMaxDateNumber,
} from "@/app/components/festivals/registration/forms/helpers";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { DateTime } from "luxon";
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
      .max(2017, {
        message: "El año no puede ser mayor a 2017",
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

  const yearOptions = Array.from({ length: 100 }, (_, i) => ({
    value: (new Date().getFullYear() - 7 - i).toString(),
    label: (new Date().getFullYear() - 7 - i).toString(),
  }));

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label:
      DateTime.fromObject({ month: i + 1 })
        .toLocaleString({
          month: "long",
        })
        .charAt(0)
        .toUpperCase() +
      DateTime.fromObject({ month: i + 1 })
        .toLocaleString({
          month: "long",
        })
        .slice(1),
  }));

  const dayOptions = Array.from(
    {
      length: getDaysInMonth(form.getValues("month"), form.getValues("year")),
    },
    (_, i) => ({
      value: (i + 1).toString(),
      label: (i + 1).toString(),
    }),
  );

  const action: () => void = form.handleSubmit(async (data) => {
    const birthdate = new Date(data.year, data.month - 1, data.day);
    props.onSubmit(birthdate);
  });

  return (
    <Form {...form}>
      <form className="flex gap-6 flex-col" onSubmit={action}>
        <div className="flex items-end gap-4">
          <SelectInput
            className="w-full"
            variant="quiet"
            side="top"
            formControl={form.control}
            label="Año"
            name="year"
            placeholder="AAAA"
            options={yearOptions}
          />
          <span className="text-2xl text-muted-foreground">/</span>
          <SelectInput
            className="w-full"
            variant="quiet"
            side="top"
            formControl={form.control}
            label="Mes"
            name="month"
            placeholder="MM"
            options={monthOptions}
          />
          <span className="text-2xl text-muted-foreground">/</span>
          <SelectInput
            className="w-full"
            variant="quiet"
            side="top"
            formControl={form.control}
            label="Día"
            name="day"
            placeholder="DD"
            options={dayOptions}
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

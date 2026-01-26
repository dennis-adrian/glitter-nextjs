import {
  getDaysOptions,
  getMonthsOptions,
  getYearsOptions,
} from "@/app/components/festivals/registration/forms/helpers";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

const FormSchema = z
  .object({
    day: z.coerce
      .number({
          error: (issue) => issue.input === undefined ? "El día es requerido" : "El día no es válido"
    })
      .min(1, {
          error: "Mes no válido"
    }),
    month: z.coerce
      .number({
          error: (issue) => issue.input === undefined ? "El mes es requerido" : "El mes no es válido"
    })
      .min(1, {
          error: "Mes no válido"
    })
      .max(12, {
          error: "Mes no válido"
    }),
    year: z.coerce
      .number({
          error: (issue) => issue.input === undefined ? "El año es requerido" : "El año no es válido"
    })
      .min(1940, {
          error: "El año no puede ser menor a 1940"
    }),
  })
  .superRefine((data, ctx) => {
    const date = DateTime.fromObject(data);
    if (!date.isValid) {
      ctx.addIssue({
        code: "custom",
        message: "La fecha no es válida",
        path: ["year"],
      });

      return;
    }

    if (DateTime.now().diff(date, "years").years < 10) {
      ctx.addIssue({
        code: "custom",
        message: "Un menor de 10 años no puede registrarse",
        path: ["year"],
      });
    }
  });

type BirthdayFormProps = {
  onSubmit: (birthdate: Date) => void;
};

export default function BirthdayForm(props: BirthdayFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      day: new Date().getDate(),
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear() - 2,
    },
  });

  const [year, month] = useWatch({
    control: form.control,
    name: ["year", "month"],
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const birthdate = new Date(data.year, data.month - 1, data.day);
    props.onSubmit(birthdate);
  });

  return (
    <Form {...form}>
      <form className="flex gap-6 flex-col" onSubmit={action}>
        <div className="flex items-end gap-1 sm:gap-4">
          <SelectInput
            className="w-full"
            variant="quiet"
            side="top"
            formControl={form.control}
            label="Año"
            name="year"
            placeholder="AAAA"
            options={getYearsOptions()}
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
            options={getMonthsOptions()}
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
            options={getDaysOptions(month, year)}
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

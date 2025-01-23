import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { createTicket } from "@/app/data/tickets/actions";
import { createVisitor, NewVisitor } from "@/app/data/visitors/actions";
import { formatDate } from "@/app/lib/formatters";
import { genderOptions } from "@/app/lib/utils";
import { genderEnum } from "@/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  gender: z.enum([...genderEnum.enumValues]),
});

type GenderFormProps = {
  festival: FestivalWithDates;
  numberOfVisitors?: number;
  visitor: NewVisitor;
};
export default function GenderForm(props: GenderFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      gender: "other",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await createVisitor({
      firstName: props.visitor.firstName,
      lastName: props.visitor.lastName,
      email: props.visitor.email,
      phoneNumber: props.visitor.phoneNumber,
      gender: props.visitor.gender,
      birthdate: props.visitor.birthdate,
    });

    if (res.success) {
      toast.success("La información ha sido guardada");

      const ticketDate = props.festival.festivalDates.find((festivalDate) => {
        return formatDate(festivalDate.startDate)
          .startOf("day")
          .equals(formatDate(new Date()).startOf("day"));
      });

      if (!ticketDate) {
        toast.error("No tenemos entradas disponibles para hoy");
        return;
      }

      const ticketRes = await createTicket({
        date: ticketDate.startDate,
        festival: props.festival,
        numberOfVisitors: props.numberOfVisitors,
        visitor: res.visitor!,
      });

      if (ticketRes.success) {
        toast.success(ticketRes.message);
      } else {
        toast.error(ticketRes.message);
      }
    } else {
      toast.error("Ups! No se pudo guardar la información");
    }
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
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          <span>Finalizar</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}

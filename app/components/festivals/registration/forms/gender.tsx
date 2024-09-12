import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { genderEnum } from "@/db/schema";
import { Form } from "@/app/components/ui/form";
import SelectInput from "@/app/components/form/fields/select";
import { genderOptions } from "@/app/lib/utils";
import { createVisitor } from "@/app/data/visitors/actions";
import SubmitButton from "@/app/components/simple-submit-button";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { createTicket } from "@/app/data/tickets/actions";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";

const FormSchema = z.object({
  gender: z.enum([...genderEnum.enumValues]),
});

type GenderFormProps = {
  festival: FestivalWithDates;
  numberOfVisitors?: number;
};
export default function GenderForm(props: GenderFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      gender: "other",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const currentParams = new URLSearchParams(searchParams.toString());
    const res = await createVisitor({
      firstName: searchParams.get("firstName") || "",
      lastName: searchParams.get("lastName") || "",
      email: searchParams.get("email") || "",
      phoneNumber: searchParams.get("phoneNumber") || "",
      gender: data.gender,
      birthdate: new Date(searchParams.get("birthdate") || ""),
    });

    if (res.success) {
      toast.success("La información ha sido guardada");
      currentParams.set("visitorId", res.visitor!.id.toString());
      currentParams.set("step", "5");

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

    router.push(`?${currentParams.toString()}`);
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

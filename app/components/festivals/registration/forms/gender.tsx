import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { number, z } from "zod";
import { genderEnum } from "@/db/schema";
import { Form } from "@/app/components/ui/form";
import SelectInput from "@/app/components/form/fields/select";
import { genderOptions } from "@/app/lib/utils";
import {
  createVisitor,
  NewVisitor,
  VisitorWithTickets,
} from "@/app/data/visitors/actions";
import SubmitButton from "@/app/components/simple-submit-button";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { createEventDayTicket } from "@/app/data/tickets/actions";
import { FestivalWithDates } from "@/app/data/festivals/definitions";

const FormSchema = z.object({
  gender: z.enum([...genderEnum.enumValues]),
});

type GenderFormProps = {
  festival: FestivalWithDates;
  numberOfVisitors?: number;
  visitor: NewVisitor;
  onSubmit: () => void;
};
export default function GenderForm(props: GenderFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      gender: "undisclosed",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const currentParams = new URLSearchParams(searchParams.toString());
    const res = await createVisitor({
      ...props.visitor,
      email: searchParams.get("email") || "",
      gender: data.gender,
    });

    if (res.success) {
      props.onSubmit();
      toast.success("La información ha sido guardada");
      currentParams.set("visitorId", res.visitor!.id.toString());
      router.push(`?${currentParams.toString()}`);

      const ticketRes = await createEventDayTicket({
        festival: props.festival,
        numberOfVisitors: props.numberOfVisitors || 1,
        visitorId: res.visitor!.id,
      });

      if (ticketRes.success) {
        toast.success("Se ha creado el ticket");
      } else {
        toast.error("Ups! No se pudo crear el ticket");
      }
    } else {
      toast.error("Ups! No se pudo guardar la información");
    }
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={action}>
        <SelectInput
          formControl={form.control}
          name="gender"
          options={genderOptions}
          placeholder="Elige una opción"
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

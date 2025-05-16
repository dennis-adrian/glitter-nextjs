import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import {
  createVisitor,
  NewVisitor,
  VisitorWithTickets,
} from "@/app/data/visitors/actions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
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
  onSuccess: (visitor: VisitorWithTickets) => void;
};
export default function GenderForm(props: GenderFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      gender: props.visitor.gender,
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await createVisitor({
      firstName: props.visitor.firstName,
      lastName: props.visitor.lastName,
      email: props.visitor.email,
      phoneNumber: props.visitor.phoneNumber,
      gender: data.gender,
      birthdate: props.visitor.birthdate,
    });

    if (res.success) {
      toast.success("Guardamos tu información correctamente");
      props.onSuccess({
        ...res.visitor!,
        tickets: [],
      });
    } else {
      toast.error("Ups! No se pudo guardar la información. Intenta nuevamente");
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

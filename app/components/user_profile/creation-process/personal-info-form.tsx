import { ProfileType } from "@/app/api/users/definitions";
import DateInput from "@/app/components/form/fields/date";
import SelectInput from "@/app/components/form/fields/select";
import { birthdateValidator } from "@/app/components/form/input-validators";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { countryOptions } from "@/app/lib/countryOptions";
import { updateProfile } from "@/app/lib/users/actions";
import { genderOptions, stateOptions } from "@/app/lib/utils";
import { dateToString, stringToUTCDate } from "@/app/utils/dateUtils";
import { genderEnum } from "@/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLineIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z
	.object({
		birthdate: birthdateValidator({
			minAge: 16,
			minAgeMessage: "Debes tener al menos 16 años para participar de nuestros eventos",
		}),
		gender: z.enum([...genderEnum.enumValues], {
            error: (issue) => issue.input === undefined ? "El género es requerido" : undefined
        }),
		country: z
			.string({
                error: (issue) => issue.input === undefined ? "El país es requerido" : undefined
            })
			.trim()
			.min(2, {
                error: "El país es requerido"
            }),
		state: z.string().trim().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.country === "BO" && !data.state) {
			ctx.addIssue({
				code: "custom",
				message: "El departamento es requerido",
				path: ["state"],
			});
			return;
		}
		return;
	});

type PersonalInfoFormProps = {
  profile: ProfileType;
};

export default function PersonalInfoForm(props: PersonalInfoFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: props.profile.birthdate || stringToUTCDate("2005-01-01"),
      gender: props.profile.gender,
      country: props.profile.country || "",
      state: props.profile.state || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const stringBirthdate = dateToString(data.birthdate);
    const birthdate = stringToUTCDate(stringBirthdate);

    const res = await updateProfile(props.profile.id, {
      ...data,
      birthdate,
    });
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form
        onSubmit={action}
        className="w-full my-4 grid gap-4 items-start grid-cols-1 sm:grid-cols-2"
      >
        <DateInput
          bottomBorderOnly
          formControl={form.control}
          label="Fecha de nacimiento"
          name="birthdate"
        />
        <SelectInput
          formControl={form.control}
          label="Género"
          name="gender"
          options={genderOptions}
          placeholder="Elige una opción"
          variant="quiet"
        />
        <SelectInput
          formControl={form.control}
          label="País de residencia"
          name="country"
          options={countryOptions}
          placeholder="Elige una opción"
          variant="quiet"
        />
        {form.watch("country") === "BO" && (
          <SelectInput
            formControl={form.control}
            label="Departamento de residencia"
            name="state"
            options={stateOptions}
            placeholder="Elige una opción"
            variant="quiet"
          />
        )}
        <div className="flex gap-2 my-4 col-span-1 sm:col-span-2">
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Guardar
            <ArrowDownToLineIcon className="ml-2 w-4 h-4" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}

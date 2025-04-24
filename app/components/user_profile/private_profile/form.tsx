"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { genderOptions, stateOptions } from "@/app/lib/utils";

import { Form } from "@/app/components/ui/form";
import { ProfileType } from "@/app/api/users/definitions";
import { genderEnum } from "@/db/schema";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import TextInput from "@/app/components/form/fields/text";
import { formatDate } from "@/app/lib/formatters";
import { toast } from "sonner";
import { updateProfile } from "@/app/lib/users/actions";
import DateInput from "@/app/components/form/fields/date";
import PhoneInput from "@/app/components/form/fields/phone";
import { countryOptions } from "@/app/lib/countryOptions";
import { dateToString } from "@/app/utils/dateUtils";
import { stringToUTCDate } from "@/app/utils/dateUtils";
import { birthdateValidator, phoneValidator } from "@/app/components/form/input-validators";

const FormSchema = z
	.object({
		birthdate: birthdateValidator({
			minAge: 16,
			minAgeMessage: "Debes tener al menos 16 años para participar de nuestros eventos",
		}),
		firstName: z.string().trim().min(2, { message: "El nombre tiene que tener al menos dos letras" }),
		lastName: z.string().trim().min(2, { message: "El apellido tiene que tener al menos dos letras" }),
		phoneNumber: phoneValidator(),
		gender: z.enum([...genderEnum.enumValues], {
			required_error: "El género es requerido",
		}),
		country: z
			.string({
				required_error: "El país es requerido",
			})
			.trim()
			.min(2, { message: "El país es requerido" }),
		state: z.string().trim().optional(),
	})
	.superRefine((data, ctx) => {
		if (data.country === "BO" && !data.state) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "El departamento es requerido",
				path: ["state"],
			});
			return false;
		}
		return true;
	});

export default function PrivateProfileForm({ profile, onSuccess }: { profile: ProfileType; onSuccess: () => void }) {
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			birthdate: profile.birthdate || undefined,
			firstName: profile.firstName || "",
			lastName: profile.lastName || "",
			phoneNumber: profile.phoneNumber || "",
			gender: profile.gender,
			state: profile.state || "",
			country: profile.country || "",
		},
	});

	const action: () => void = form.handleSubmit(async (data) => {
		const stringBirthdate = dateToString(data.birthdate);
		const birthdate = stringToUTCDate(stringBirthdate);

		const result = await updateProfile(profile.id, {
			...data,
			birthdate,
		});

		if (result.success) {
			toast.success(result.message);
			onSuccess();
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={action} className="grid items-start gap-4 mt-4">
				<TextInput bottomBorderOnly formControl={form.control} name="firstName" label="Ingres tu nombre" />
				<TextInput bottomBorderOnly formControl={form.control} name="lastName" label="Ingres tu apellido" />
				<DateInput bottomBorderOnly formControl={form.control} name="birthdate" label="Fecha de nacimiento" />
				<PhoneInput bottomBorderOnly formControl={form.control} name="phoneNumber" label="Número de teléfono" />
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
				<SubmitButton disabled={form.formState.isSubmitting} loading={form.formState.isSubmitting}>
					Guardar cambios
				</SubmitButton>
			</form>
		</Form>
	);
}

"use client";

import DateInput from "@/app/components/form/fields/date";
import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import {
	birthdateValidator,
	phoneValidator,
} from "@/app/components/form/input-validators";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { VisitorBase, createVisitor } from "@/app/data/visitors/actions";
import { genderOptions } from "@/app/lib/utils";
import { dateToString, stringToUTCDate } from "@/app/utils/dateUtils";
import { genderEnum } from "@/db/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightCircleIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	birthdate: birthdateValidator({
		minAge: 10,
		minAgeMessage: "Debes tener al menos 10 años para registrarte",
	}),
	email: z.email({
                error: "El correo electronico no es valido"
            }),
	firstName: z
		.string()
		.min(2, {
            error: "El nombre tiene que tener al menos dos letras"
        }),
	gender: z.enum([...genderEnum.enumValues]),
	lastName: z
		.string()
		.min(2, {
            error: "El apellido tiene que tener al menos dos letras"
        }),
	phoneNumber: phoneValidator(),
});

export default function VisitorRegistrationForm({
	email,
	visitor,
}: {
	email: string;
	visitor: VisitorBase | undefined | null;
}) {
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			birthdate:
				visitor?.birthdate || DateTime.now().minus({ years: 10 }).toJSDate(),
			email: email,
			firstName: visitor?.firstName || "",
			gender: visitor?.gender || "other",
			lastName: visitor?.lastName || "",
			phoneNumber: visitor?.phoneNumber || "",
		},
	});

	const action = form.handleSubmit(async (data: z.infer<typeof FormSchema>) => {
		const stringBirthdate = dateToString(data.birthdate);
		const birthdate = stringToUTCDate(stringBirthdate);

		const res = await createVisitor({
			...data,
			birthdate,
		});

		if (res.success) {
			router.push(`?${new URLSearchParams({ email: data.email, step: "3" })}`);
		} else {
			toast.error(res.error);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={action} className="grid items-start gap-4 md:gap-6">
				<TextInput
					bottomBorderOnly
					formControl={form.control}
					name="email"
					label="Email"
					type="email"
					disabled
				/>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<TextInput
						bottomBorderOnly
						formControl={form.control}
						name="firstName"
						label="Nombre"
						type="text"
					/>
					<TextInput
						bottomBorderOnly
						formControl={form.control}
						name="lastName"
						label="Apellido"
						type="text"
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<DateInput
						bottomBorderOnly
						formControl={form.control}
						name="birthdate"
						label="Fecha de nacimiento"
					/>
					<PhoneInput
						bottomBorderOnly
						formControl={form.control}
						name="phoneNumber"
						label="Teléfono"
					/>
					<SelectInput
						variant="quiet"
						formControl={form.control}
						label="Género"
						name="gender"
						options={genderOptions}
						side="top"
					/>
				</div>
				<SubmitButton
					className="my-2"
					disabled={
						form.formState.isSubmitting || form.formState.isSubmitSuccessful
					}
					loading={form.formState.isSubmitting}
				>
					Siguiente <ArrowRightCircleIcon className="ml-2 h-4 w-4" />
				</SubmitButton>
			</form>
		</Form>
	);
}

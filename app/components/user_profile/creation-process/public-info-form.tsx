import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLineIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ProfileType } from "@/app/api/users/definitions";
import TextInput from "@/app/components/form/fields/text";
import { nameValidator } from "@/app/components/form/input-validators";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { updateProfile } from "@/app/lib/users/actions";

const FormSchema = z.object({
	firstName: nameValidator(),
	lastName: nameValidator(),
	email: z.email({
		error: "Ingresá un email válido",
	}),
});

type PublicInfoFormProps = {
	profile: ProfileType;
};

export default function PublicInfoForm(props: PublicInfoFormProps) {
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			firstName: props.profile.firstName || "",
			lastName: props.profile.lastName || "",
			email: props.profile.email || "",
		},
	});

	const action = form.handleSubmit(async (data) => {
		try {
			const res = await updateProfile(props.profile.id, {
				firstName: data.firstName,
				lastName: data.lastName,
				email: data.email,
			});
			if (res.success) {
				toast.success(res.message);
			} else {
				toast.error(res.message);
			}
		} catch (error) {
			toast.error("Error al guardar los datos");
		}
	});

	return (
		<Form {...form}>
			<form
				onSubmit={action}
				className="w-full mt-4 md:mt-6 grid gap-4 items-start grid-cols-1 sm:grid-cols-2"
			>
				<TextInput
					bottomBorderOnly
					label="Nombre"
					name="firstName"
					placeholder="Ingresa tu nombre"
				/>
				<TextInput
					bottomBorderOnly
					label="Apellido"
					name="lastName"
					placeholder="Ingresa tu apellido"
				/>
				<TextInput
					bottomBorderOnly
					label="Correo electrónico"
					name="email"
					placeholder="Ingresa tu correo electrónico"
					type="email"
				/>
				<div className="flex gap-2 my-2 col-span-1 sm:col-span-2">
					<SubmitButton
						disabled={
							form.formState.isSubmitting || form.formState.isSubmitSuccessful
						}
						loading={form.formState.isSubmitting}
						loadingLabel="Guardando"
					>
						Guardar
						<ArrowDownToLineIcon className="ml-2 w-4 h-4" />
					</SubmitButton>
				</div>
			</form>
		</Form>
	);
}

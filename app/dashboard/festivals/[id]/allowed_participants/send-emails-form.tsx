"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { sendUserEmailsTemp } from "@/app/data/festivals/actions";
import { useForm } from "react-hook-form";

type SendEmailsFormProps = {
	users: BaseProfile[];
	festivalId: number;
};

export default function SendEmailsForm({
	users,
	festivalId,
}: SendEmailsFormProps) {
	const form = useForm();

	const action = form.handleSubmit(async () => {
		await sendUserEmailsTemp(users, festivalId);
	});

	return (
		<Form {...form}>
			<form onSubmit={action}>
				<SubmitButton
					disabled={form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
					label="Enviar correos"
				/>
			</form>
		</Form>
	);
}

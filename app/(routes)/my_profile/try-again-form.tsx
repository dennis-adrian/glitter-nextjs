"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { useClerk } from "@clerk/nextjs";
import { useForm } from "react-hook-form";

export default function TryAgainForm() {
	const { signOut } = useClerk();
	const form = useForm();

	const action = form.handleSubmit(async () => {
		signOut({
			redirectUrl: "/sign_in",
		});
	});

	return (
		<Form {...form}>
			<form className="mt-2" onSubmit={action}>
				<SubmitButton
					disabled={
						form.formState.isSubmitting || form.formState.isSubmitSuccessful
					}
					loading={
						form.formState.isSubmitting ||
						form.formState.isSubmitSuccessful ||
						form.formState.isLoading
					}
				>
					Intentar nuevamente
				</SubmitButton>
			</form>
		</Form>
	);
}

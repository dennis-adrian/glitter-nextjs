"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { deleteUserSocial } from "@/app/lib/users/actions";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type DeleteSocialMediaFormProps = {
	socialId: number;
};

export default function DeleteSocialMediaForm({
	socialId,
}: DeleteSocialMediaFormProps) {
	const form = useForm();

	const action = form.handleSubmit(async () => {
		const { success, message } = await deleteUserSocial(
			socialId,
			"/my_profile",
		);
		if (success) {
			toast.success(message);
		} else {
			toast.error(message);
		}
	});

	return (
		<Form {...form}>
			<form className="flex items-center justify-center py-1" onSubmit={action}>
				{form.formState.isSubmitting ? (
					<Loader2Icon className="ml-2 w-4 h-4 text-destructive animate-spin" />
				) : (
					<button className="ml-2 p-0 h-fit w-fit hover:bg-transparent">
						<Trash2Icon className="w-4 h-4 text-destructive hover:text-destructive/80" />
					</button>
				)}
			</form>
		</Form>
	);
}

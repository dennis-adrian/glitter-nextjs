"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProfileType, UpdateUser } from "@/app/api/users/definitions";

import SubmitButton from "@/app/components/simple-submit-button";
import { Input } from "@/app/components/ui/input";
import { updateProfile } from "@/app/lib/users/actions";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const FormSchema = z.object({
	bio: z
		.string()
		.trim()
		.min(10, {
            error: "Escribe una bio un poco más larga"
        }),
	displayName: z.string().trim().min(2, {
        error: "El nombre de artista tiene que tener al menos dos letras"
    }),
});

export default function PublicProfileForm({
	profile,
	onSuccess,
}: {
	profile: ProfileType;
	onSuccess: () => void;
}) {
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			bio: profile.bio || "",
			displayName: profile.displayName || "",
		},
	});

	const action: () => void = form.handleSubmit(async (data) => {
		const { dirtyFields } = form.formState;
		const dirtyFieldsKeys = Object.keys(dirtyFields) as (keyof typeof data)[];

		const fieldsToUpdate: UpdateUser = {};
		for (const key of dirtyFieldsKeys) {
			const value = data[key as keyof typeof data];
			if (value !== undefined) {
				fieldsToUpdate[key as keyof UpdateUser] = value as any;
			}
		}

		if (Object.keys(fieldsToUpdate).length > 0) {
			const result = await updateProfile(profile.id, {
				...fieldsToUpdate,
			});

			if (result.success) {
				toast.success(result.message);
				onSuccess();
			} else {
				toast.error(result.message);
			}
		}
	});

	return (
		<>
			<Form {...form}>
				<form onSubmit={action} className="grid items-start gap-4">
					<FormField
						control={form.control}
						name="displayName"
						render={({ field }) => (
							<FormItem className="grid gap-2">
								<FormLabel>Nombre Público</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder="Ingresa tu nombre"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="bio"
						render={({ field }) => (
							<FormItem className="grid gap-2">
								<FormLabel>Bio</FormLabel>
								<FormControl>
									<Textarea
										className="resize-none"
										maxLength={80}
										placeholder="Escribe un poco sobre ti"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<SubmitButton
						disabled={form.formState.isSubmitting || !form.formState.isDirty}
						loading={form.formState.isSubmitting}
					>
						Guardar cambios
					</SubmitButton>
				</form>
			</Form>
		</>
	);
}

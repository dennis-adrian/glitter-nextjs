"use client";

import { Button } from "@/app/components/ui/button";
import { CirclePlusIcon } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";
import { BaseProfile, UserSocial } from "@/app/api/users/definitions";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	socialMediaIcons,
	socialMediaOptions,
	usernameRegex,
} from "@/app/lib/users/utils";
import SocialMediaInput from "@/app/components/form/fields/social-media";
import { upsertUserSocialProfiles } from "@/app/lib/users/actions";
import { toast } from "sonner";
import { userSocialTypeEnum } from "@/db/schema";

const FormSchema = z.object({
	type: z.enum(userSocialTypeEnum.enumValues, {
		required_error: "La plataforma es requerida",
	}),
	username: z
		.string({ required_error: "El nombre de usuario es requerido" })
		.trim()
		.min(2, {
			message: "El nombre de usuario no puede estar vacío",
		})
		.regex(
			usernameRegex,
			"El nombre de usuario no puede tener caracteres especiales",
		),
});

type AddUserSocialModalProps = {
	profile: BaseProfile;
};

export default function AddUserSocialModal({
	profile,
}: AddUserSocialModalProps) {
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
	});

	const action = form.handleSubmit(async (data) => {
		const res = await upsertUserSocialProfiles(profile.id, [
			{
				type: data.type,
				username: data.username,
			},
		]);

		if (res.success) {
			toast.success(res.message);
		} else {
			toast.error(res.message);
		}
	});

	const getIcon = (type: UserSocial["type"]) => {
		const Icon = socialMediaIcons[type];
		return <Icon className="w-4 h-4" />;
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					className="rounded-full h-fit w-fit py-1 px-2"
				>
					<CirclePlusIcon className="mr-1 h-4 w-4" />
					Agregar
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Agregar red social</DialogTitle>
					<DialogDescription>
						Agrega una nueva red social a tu perfil.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-6 mt-4" onSubmit={action}>
						<SelectInput
							formControl={form.control}
							variant="quiet"
							label="Plataforma"
							name="type"
							options={socialMediaOptions.map((option) => ({
								label: (
									<div className="flex items-center gap-2">
										{getIcon(option.value)} {option.label}
									</div>
								),
								value: option.value,
							}))}
							placeholder="Selecciona una plataforma"
						/>
						<SocialMediaInput
							formControl={form.control}
							label="Nombre de usuario"
							name="username"
							placeholder="Nombre de usuario"
							icon={socialMediaIcons[form.watch("type")]}
						/>
						<SubmitButton
							disabled={
								form.formState.isSubmitting || form.formState.isSubmitSuccessful
							}
							loading={form.formState.isSubmitting}
							loadingLabel="Agregando..."
						>
							Agregar
						</SubmitButton>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

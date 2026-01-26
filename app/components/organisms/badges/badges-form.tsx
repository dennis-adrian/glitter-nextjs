"use client";

import FileInput from "@/app/components/form/fields/file";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createBadge } from "@/app/lib/badges/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	name: z.string({
        error: (issue) => issue.input === undefined ? "El nombre es requerido" : undefined
    }).trim().min(1),
	description: z.string().trim().optional(),
	imageUrl: z.url().trim(),
	festivalId: z.coerce.number().int().positive(),
});

type BadgesFormProps = {
	festivalsOptions: { label: string; value: string }[];
};

export default function BadgesForm({ festivalsOptions }: BadgesFormProps) {
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: "",
			description: "",
		},
	});

	const action = form.handleSubmit(async (data) => {
		const res = await createBadge(data);

		if (res.success) {
			toast.success(res.message);
			form.reset();
			router.push("/dashboard/badges");
		} else {
			toast.error(res.message);
		}
	});

	return (
		<Form {...form}>
			<form className="grid gap-4" onSubmit={action}>
				<TextInput formControl={form.control} label="Nombre" name="name" />
				<TextInput
					formControl={form.control}
					label="Descripción"
					name="description"
				/>
				<SelectInput
					formControl={form.control}
					label="Festival"
					name="festivalId"
					options={festivalsOptions}
				/>
				<FileInput formControl={form.control} label="Imagen" name="imageUrl" />
				<SubmitButton
					disabled={form.formState.isSubmitting || !form.formState.isDirty}
					loading={form.formState.isSubmitting}
				>
					Guardar
				</SubmitButton>
			</form>
		</Form>
	);
}

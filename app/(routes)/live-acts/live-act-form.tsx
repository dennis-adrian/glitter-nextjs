"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	CircleCheckIcon,
	Loader2Icon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { createLiveAct } from "@/app/lib/live_acts/actions";
import { liveActSchema, type LiveActInput } from "@/app/lib/live_acts/schema";

const categoryOptions = [
	{ value: "music", label: "Música" },
	{ value: "dance", label: "Danza" },
	{ value: "talk", label: "Charla" },
];

export default function LiveActForm() {
	const [submitted, setSubmitted] = useState(false);

	const form = useForm<LiveActInput>({
		resolver: zodResolver(liveActSchema),
		defaultValues: {
			actName: "",
			category: undefined,
			description: "",
			resourceLink: "",
			socialLinks: [],
			contactName: "",
			contactEmail: "",
			contactPhone: "",
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "socialLinks" as never,
	});

	const category = form.watch("category");
	const isLoading = form.formState.isSubmitting;

	async function onSubmit(values: LiveActInput) {
		const result = await createLiveAct({
			actName: values.actName,
			category: values.category,
			description: values.description || null,
			resourceLink: values.resourceLink || null,
			socialLinks: values.socialLinks ?? [],
			contactName: values.contactName,
			contactEmail: values.contactEmail,
			contactPhone: values.contactPhone,
		});

		if (result.success) {
			setSubmitted(true);
		} else {
			toast.error(result.error ?? "Error al enviar la postulación");
		}
	}

	if (submitted) {
		return (
			<div className="flex flex-col items-center gap-4 rounded-lg border p-8 text-center">
				<CircleCheckIcon className="h-12 w-12 text-green-500" />
				<h2 className="text-xl font-semibold">¡Postulación enviada!</h2>
				<p className="text-muted-foreground">
					Recibimos tu información. Nos pondremos en contacto si tu acto es
					seleccionado para participar.
				</p>
			</div>
		);
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="flex flex-col gap-6"
			>
				<div className="flex flex-col gap-4">
					<h2 className="text-lg font-semibold">El acto</h2>

					<SelectInput
						formControl={form.control}
						name="category"
						label="Categoría"
						placeholder="Seleccioná una categoría"
						options={categoryOptions}
					/>

					<TextInput
						name="actName"
						label="Nombre de la presentación"
						placeholder="Nombre del acto o artista"
					/>

					<TextareaInput
						formControl={form.control}
						name="description"
						label={
							category === "talk"
								? "Descripción / Abstract *"
								: "Descripción (opcional)"
						}
						placeholder={
							category === "talk"
								? "Breve resumen de tu charla (mínimo 20 caracteres)"
								: "Contanos sobre tu acto"
						}
						maxLength={1000}
					/>

					<TextInput
						name="resourceLink"
						label={
							category === "talk"
								? "Link al documento (Google Drive, etc.)"
								: "Link de video/audio (YouTube, Spotify, Google Drive, etc.)"
						}
						placeholder="https://"
						type="url"
					/>

					<div className="flex flex-col gap-2">
						<p className="text-sm font-medium">
							Redes sociales / sitio web (opcional)
						</p>
						{fields.map((field, index) => (
							<div key={field.id} className="flex items-start gap-2">
								<div className="flex-1">
									<TextInput
										name={`socialLinks.${index}`}
										placeholder="https://"
										type="url"
									/>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
									onClick={() => remove(index)}
								>
									<Trash2Icon className="h-4 w-4" />
								</Button>
							</div>
						))}
						{fields.length < 5 && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="w-fit"
								onClick={() => append("")}
							>
								<PlusIcon className="mr-2 h-4 w-4" />
								Agregar link
							</Button>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-4">
					<h2 className="text-lg font-semibold">Información de contacto</h2>

					<TextInput
						name="contactName"
						label="Nombre completo"
						placeholder="Tu nombre"
						autoComplete="name"
					/>

					<TextInput
						name="contactEmail"
						label="Correo electrónico"
						placeholder="tu@email.com"
						type="email"
						autoComplete="email"
					/>

					<PhoneInput name="contactPhone" label="Número de teléfono" />
				</div>

				<Button type="submit" disabled={isLoading} className="w-full" size="lg">
					{isLoading ? (
						<span className="flex items-center gap-2">
							<Loader2Icon className="h-4 w-4 animate-spin" />
							Enviando...
						</span>
					) : (
						"Enviar postulación"
					)}
				</Button>
			</form>
		</Form>
	);
}

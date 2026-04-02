"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	ChevronLeftIcon,
	CircleCheckIcon,
	Loader2Icon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import Heading from "@/app/components/atoms/heading";
import PhoneInput from "@/app/components/form/fields/phone";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { createLiveAct } from "@/app/lib/live_acts/actions";
import { liveActSchema, type LiveActInput } from "@/app/lib/live_acts/schema";
import CategorySelector from "./category-selector";
import { CATEGORY_CONFIG, type Category } from "./category-config";

export default function LiveActForm() {
	const [submitted, setSubmitted] = useState(false);
	const [step, setStep] = useState<"select" | "form">("select");

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

	const category = form.watch("category") as Category | undefined;
	const isLoading = form.formState.isSubmitting;
	const config = category ? CATEGORY_CONFIG[category] : CATEGORY_CONFIG.music;

	async function onSubmit(values: LiveActInput) {
		const result = await createLiveAct({
			actName: values.actName,
			category: values.category,
			description: values.description || null,
			resourceLink: values.resourceLink,
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

	function handleSelectCategory(cat: Category) {
		form.setValue("category", cat, { shouldValidate: false });
		setStep("form");
	}

	function handleBack() {
		form.resetField("category");
		setStep("select");
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

	if (step === "select") {
		return (
			<>
				<div className="mb-1 md:mb-3">
					<Heading>Presentaciones en vivo</Heading>
				</div>
				<CategorySelector onSelect={handleSelectCategory} />
			</>
		);
	}

	return (
		<>
			<div className="mb-2 md:mb-4 flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="-ml-2 shrink-0"
					onClick={handleBack}
				>
					<ChevronLeftIcon className="h-5 w-5" />
					<span className="sr-only">Cambiar tipo de presentación</span>
				</Button>
				<Heading level={2}>Presentaciones en vivo</Heading>
			</div>
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col gap-6 pb-24 md:pb-0"
				>
					<div className="flex flex-col gap-4">
						<h2 className="text-lg font-medium">Datos de la presentación</h2>

						<TextInput
							name="actName"
							label={config.actNameLabel}
							placeholder={config.actNamePlaceholder}
							required={config.actNameRequired}
						/>

						<TextareaInput
							formControl={form.control}
							name="description"
							label={config.descriptionLabel}
							placeholder={config.descriptionPlaceholder}
							maxLength={1000}
							required={config.descriptionRequired}
						/>

						<TextInput
							name="resourceLink"
							label={config.resourceLinkLabel}
							placeholder="https://"
							type="url"
							required
							description={config.resourceLinkDescription}
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
							required
						/>

						<TextInput
							name="contactEmail"
							label="Correo electrónico"
							placeholder="tu@email.com"
							type="email"
							autoComplete="email"
							required
						/>

						<PhoneInput
							name="contactPhone"
							label="Número de teléfono"
							required
						/>
					</div>

					<div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:relative md:bottom-auto md:left-auto md:right-auto md:border-0 md:bg-transparent md:p-0">
						<Button
							type="submit"
							disabled={isLoading}
							className="w-full"
							size="lg"
						>
							{isLoading ? (
								<span className="flex items-center gap-2">
									<Loader2Icon className="h-4 w-4 animate-spin" />
									Enviando...
								</span>
							) : (
								"Enviar postulación"
							)}
						</Button>
					</div>
				</form>
			</Form>
		</>
	);
}

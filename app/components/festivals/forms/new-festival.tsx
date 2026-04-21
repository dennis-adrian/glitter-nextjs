"use client";
import posthog from "posthog-js";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { Button } from "@/app/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { createFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import TextareaInput from "@/app/components/form/fields/textarea";
import TextInput from "../../form/fields/text";
import SelectInput from "../../form/fields/select";
import { festivalTypeOptions } from "@/app/lib/utils";
import { festivalTypeEnum } from "@/db/schema";
import {
	BuildingIcon,
	CalendarDaysIcon,
	Loader2,
	MapPinIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import { useFieldArray } from "react-hook-form";
import { DateTime } from "luxon";
import SectorImageUpload from "../sectors/sector-image-upload";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useRef } from "react";

const FormSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2, "El nombre tiene que tener al menos dos letras"),
	status: z
		.enum(["draft", "published", "active", "archived"])
		.prefault("draft"),
	publicRegistration: z.boolean().prefault(false),
	eventDayRegistration: z.boolean().prefault(false),
	festivalType: z.enum([...festivalTypeEnum.enumValues]),
	dates: z
		.array(
			z.object({
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				startTime: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Formato Invalido (HH:MM)"),
				endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato Invalido (HH:MM)"),
			}),
		)
		.min(1, "AL menos uno es requerido"),
	dateDetails: z
		.array(
			z.object({
				startDate: z.coerce.date(),
				endDate: z.coerce.date(),
			}),
		)
		.optional(),
	description: z.string().trim().optional(),
	address: z.string().trim().optional(),
	locationLabel: z.string().trim().optional(),
	locationUrl: z.url().optional().or(z.literal("")),
	generalMapUrl: z.string().optional(),
	mascotUrl: z.string().optional(),
	illustrationPaymentQrCodeUrl: z.string().optional(),
	gastronomyPaymentQrCodeUrl: z.string().optional(),
	entrepreneurshipPaymentQrCodeUrl: z.string().optional(),
	illustrationStandUrl: z.string().optional(),
	gastronomyStandUrl: z.string().optional(),
	entrepreneurshipStandUrl: z.string().optional(),
	festivalCode: z.string().optional(),
	festivalBannerUrl: z.string().optional(),
	festivalSectors: z
		.array(
			z.object({
				name: z.string().min(1, "El nombre del sector es requerido"),
				orderInFestival: z.coerce
					.number()
					.min(1, "El orden debe ser al menos 1"),
				mapUrl: z.string().optional(),
				mascotUrl: z.string().optional(),
			}),
		)
		.min(1, "Debe haber al menos un sector"),
});

function getFirstErrorPath(
	errors: FieldErrors<z.input<typeof FormSchema>>,
	parentPath = "",
): string | undefined {
	for (const [key, value] of Object.entries(
		errors as Record<string, unknown>,
	)) {
		if (!value) continue;
		const currentPath = parentPath ? `${parentPath}.${key}` : key;

		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index++) {
				const nested = value[index];
				if (!nested) continue;
				const nestedPath = getFirstErrorPath(
					nested as FieldErrors<z.input<typeof FormSchema>>,
					`${currentPath}.${index}`,
				);
				if (nestedPath) return nestedPath;
			}
			continue;
		}

		if (typeof value === "object") {
			if ("message" in value || "type" in value) return currentPath;
			const nestedPath = getFirstErrorPath(
				value as FieldErrors<z.input<typeof FormSchema>>,
				currentPath,
			);
			if (nestedPath) return nestedPath;
		}
	}

	return undefined;
}

export default function NewFestivalForm() {
	const datesSectionRef = useRef<HTMLDivElement>(null);
	const router = useRouter();
	const form = useForm<
		z.input<typeof FormSchema>,
		unknown,
		z.output<typeof FormSchema>
	>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: "",
			status: "draft",
			publicRegistration: false,
			eventDayRegistration: false,
			festivalType: "glitter",
			address: "",
			locationLabel: "",
			locationUrl: "",
			dates: [
				{
					date: DateTime.local().toFormat("yyyy-MM-dd"),
					startTime: "10:00",
					endTime: "20:00",
				},
			],
			festivalSectors: [
				{
					name: "Galería",
					orderInFestival: 1,
					mapUrl: "",
					mascotUrl: "",
				},
			],
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "dates",
	});
	const {
		fields: sectorFields,
		append: appendSector,
		remove: removeSector,
	} = useFieldArray({
		control: form.control,
		name: "festivalSectors",
	});

	const addNewDate = () => {
		append({
			date: DateTime.local().toFormat("yyyy-MM-dd"),
			startTime: "10:00",
			endTime: "20:00",
		});
	};

	useEffect(() => {
		if (fields.length > 0) return;
		append({
			date: DateTime.local().toFormat("yyyy-MM-dd"),
			startTime: "10:00",
			endTime: "20:00",
		});
	}, [append, fields.length]);

	const onValidSubmit = async (data: z.output<typeof FormSchema>) => {
		const processedDates = data.dates.map((dateItem) => {
			const startDateTime = DateTime.fromFormat(
				`${dateItem.date} ${dateItem.startTime}`,
				"yyyy-MM-dd HH:mm",
				{ zone: "local" },
			);

			const endDateTime = DateTime.fromFormat(
				`${dateItem.date} ${dateItem.endTime}`,
				"yyyy-MM-dd HH:mm",
				{ zone: "local" },
			);

			return {
				startDate: startDateTime.toUTC().toJSDate(),
				endDate: endDateTime.toUTC().toJSDate(),
			};
		});

		const { dates: _, ...rest } = data;

		const result = await createFestival({
			...rest,
			dateDetails: processedDates,
			createdAt: new Date(),
			updatedAt: new Date(),
			reservationsStartDate: new Date(),
		});

		if (result.success) {
			posthog.capture(POSTHOG_EVENTS.FESTIVAL_CREATED, {
				festival_type: data.festivalType,
				festival_status: data.status,
				sector_count: data.festivalSectors.length,
				date_count: data.dates.length,
			});
			toast.success(result.message);
			router.push("/dashboard/festivals");
		} else {
			toast.error(result.message);
		}
	};

	const onInvalidSubmit = (errors: FieldErrors<z.input<typeof FormSchema>>) => {
		toast.error("Completa los campos requeridos antes de guardar.");
		const firstErrorPath = getFirstErrorPath(errors);
		if (!firstErrorPath) return;

		if (firstErrorPath === "dates") {
			datesSectionRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
			return;
		}

		const element = document.querySelector<HTMLElement>(
			`[name="${firstErrorPath}"]`,
		);
		if (!element && firstErrorPath.startsWith("dates")) {
			datesSectionRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
			return;
		}

		if (!element) return;
		form.setFocus(firstErrorPath as Parameters<typeof form.setFocus>[0]);
		element?.scrollIntoView({ behavior: "smooth", block: "center" });
	};

	const onSubmit = form.handleSubmit(onValidSubmit, onInvalidSubmit);
	const datesErrorMessage =
		(form.formState.errors.dates as { message?: string } | undefined)
			?.message ?? null;
	const hasDates = fields.length > 0;
	const isSubmitting = form.formState.isSubmitting;

	return (
		<div className="max-w-3xl mx-auto">
			<Form {...form}>
				<form onSubmit={onSubmit} className="space-y-6">
					<Card>
						<CardContent className="pt-6 space-y-6">
							{/* Basic Information Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl flex items-center gap-2">
									<BuildingIcon className="w-5 h-5" />
									Información Básica
								</h3>

								<TextInput
									name="name"
									label="Nombre del festival"
									type="text"
									required
								/>

								<TextareaInput
									formControl={form.control}
									label="Descripción"
									name="description"
									placeholder="Descripción del festival"
								/>

								<SelectInput
									formControl={form.control}
									label="Tipo de Festival"
									name="festivalType"
									options={festivalTypeOptions}
									side="bottom"
									required
								/>
							</div>

							{/* Location Information Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl flex items-center gap-2">
									<MapPinIcon className="w-5 h-5" />
									Información de la Ubicación
								</h3>

								<TextInput name="address" label="Dirección" type="text" />

								<TextInput
									name="locationLabel"
									label="Etiqueta de Dirección"
									type="text"
								/>

								<TextInput
									name="locationUrl"
									label="URL de Dirección"
									type="text"
									placeholder="https://example.com"
								/>
							</div>

							{/* Dates Section */}
							<div
								ref={datesSectionRef}
								className="space-y-4 p-4 border rounded-lg"
							>
								<h3 className="font-semibold text-xl flex items-center gap-2">
									<CalendarDaysIcon className="w-5 h-5" />
									Fechas del Evento
								</h3>
								{datesErrorMessage && (
									<p className="text-sm text-destructive">
										{datesErrorMessage}
									</p>
								)}
								{!hasDates && (
									<p className="text-sm text-muted-foreground">
										Debes agregar al menos una fecha para guardar el festival.
									</p>
								)}

								{fields.map((field, index) => (
									<div
										key={field.id}
										className="space-y-4 border-b pb-4 last:border-b-0 last:pb-0"
									>
										<div className="flex justify-between items-center">
											<h4 className="text-sm font-medium">
												Evento {index + 1}
											</h4>
											{index > 0 && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => remove(index)}
													className="text-red-500 hover:text-red-700"
												>
													<TrashIcon className="h-4 w-4" />
												</Button>
											)}
										</div>

										<TextInput
											name={`dates.${index}.date`}
											label="Fecha"
											type="date"
											required
										/>

										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name={`dates.${index}.startTime`}
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															Hora de inicio
															<span className="text-destructive ml-0.5">*</span>
														</FormLabel>
														<FormControl>
															<Input type="time" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>

											<FormField
												control={form.control}
												name={`dates.${index}.endTime`}
												render={({ field }) => (
													<FormItem>
														<FormLabel>
															Hora de finalización
															<span className="text-destructive ml-0.5">*</span>
														</FormLabel>
														<FormControl>
															<Input type="time" {...field} />
														</FormControl>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</div>
								))}

								<Button
									type="button"
									variant="outline"
									className="w-full mt-4"
									onClick={addNewDate}
								>
									<PlusIcon className="mr-2 h-4 w-4" />
									{hasDates ? "Agregar otra fecha" : "Agregar primera fecha"}
								</Button>
							</div>

							{/* Sectors Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl">Sectores del Festival</h3>

								{sectorFields.map((field, index) => (
									<div
										key={field.id}
										className="space-y-4 border-b pb-4 last:border-b-0 last:pb-0"
									>
										<div className="flex justify-between items-center">
											<h4 className="text-sm font-medium">
												Sector {index + 1}
											</h4>
											{index > 0 && (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => removeSector(index)}
													className="text-red-500 hover:text-red-700"
												>
													<TrashIcon className="h-4 w-4" />
												</Button>
											)}
										</div>

										<TextInput
											name={`festivalSectors.${index}.name`}
											label="Nombre del Sector"
											type="text"
											required
										/>

										<TextInput
											name={`festivalSectors.${index}.orderInFestival`}
											label="Orden en el Festival"
											type="number"
											min={1}
											required
										/>

										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name={`festivalSectors.${index}.mapUrl`}
												render={({ field }) => (
													<FormItem>
														<FormLabel>Mapa del Sector (Opcional)</FormLabel>
														<SectorImageUpload
															imageUrl={field.value || null}
															setImageUrl={field.onChange}
															sectorName={`${form.watch(`festivalSectors.${index}.name`)} Mapa`}
														/>
														<FormMessage />
													</FormItem>
												)}
											/>

											<FormField
												control={form.control}
												name={`festivalSectors.${index}.mascotUrl`}
												render={({ field }) => (
													<FormItem>
														<FormLabel>Mascota del Sector (Opcional)</FormLabel>
														<SectorImageUpload
															imageUrl={field.value || null}
															setImageUrl={field.onChange}
															sectorName={`${form.watch(`festivalSectors.${index}.name`)} Mascota`}
														/>
														<FormMessage />
													</FormItem>
												)}
											/>
										</div>
									</div>
								))}

								<Button
									type="button"
									variant="outline"
									className="w-full mt-4"
									onClick={() =>
										appendSector({
											name: "",
											orderInFestival: sectorFields.length + 1,
											mapUrl: "",
											mascotUrl: "",
										})
									}
								>
									<PlusIcon className="mr-2 h-4 w-4" />
									Agregar otro sector
								</Button>
							</div>

							<Button
								type="submit"
								size="lg"
								className="w-full md:w-auto"
								disabled={isSubmitting}
							>
								{isSubmitting && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{isSubmitting ? "Agregando Festival..." : "Agregar Festival"}
							</Button>
						</CardContent>
					</Card>
				</form>
			</Form>
		</div>
	);
}

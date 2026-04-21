"use client";

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
import { Switch } from "@/app/components/ui/switch";
import { festivalTypeOptions } from "@/app/lib/utils";
import { festivalTypeEnum } from "@/db/schema";
import { updateFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "next/navigation";
import TextInput from "../../form/fields/text";
import TextareaInput from "../../form/fields/textarea";
import {
	BuildingIcon,
	CalendarDaysIcon,
	Loader2,
	MapPinIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import SelectInput from "../../form/fields/select";
import { DateTime } from "luxon";
import { FestivalWithDatesAndSectors } from "@/app/lib/festivals/definitions";
import SectorImageUpload from "../sectors/sector-image-upload";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useRef, useState, useTransition } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";

type SectorUsage = {
	id: number;
	stands?: Array<{
		id: number;
		reservations?: Array<{ id: number }>;
	}>;
};

const FormSchema = z.object({
	name: z.string().min(1, "El nombre es requerido"),
	status: z
		.enum(["draft", "published", "active", "archived"])
		.prefault("draft"),
	mapsVersion: z.enum(["v1", "v2", "v3"]).prefault("v1"),
	publicRegistration: z.boolean().prefault(false),
	eventDayRegistration: z.boolean().prefault(false),
	keepStoreOpen: z.boolean().prefault(false),
	festivalType: z.enum([...festivalTypeEnum.enumValues]),
	dates: z
		.array(
			z.object({
				id: z.number().optional(),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				startTime: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
				endTime: z
					.string()
					.regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
			}),
		)
		.min(1, "Debe haber al menos una fecha"),
	dateDetails: z
		.array(
			z.object({
				startDate: z.coerce.date(),
				endDate: z.coerce.date(),
			}),
		)
		.optional(),
	description: z.string().optional(),
	address: z.string().optional(),
	locationLabel: z.string().optional(),
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
				id: z.number().optional(),
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

function getFirstErrorMessage(
	errors: FieldErrors<z.input<typeof FormSchema>>,
): string | undefined {
	for (const value of Object.values(errors as Record<string, unknown>)) {
		if (!value) continue;

		if (Array.isArray(value)) {
			for (const nested of value) {
				if (!nested) continue;
				const message = getFirstErrorMessage(
					nested as FieldErrors<z.input<typeof FormSchema>>,
				);
				if (message) return message;
			}
			continue;
		}

		if (typeof value === "object") {
			if ("message" in value && typeof value.message === "string") {
				return value.message;
			}
			const message = getFirstErrorMessage(
				value as FieldErrors<z.input<typeof FormSchema>>,
			);
			if (message) return message;
		}
	}

	return undefined;
}

export default function UpdateFestivalForm({
	festival,
}: {
	festival: FestivalWithDatesAndSectors;
}) {
	const deletedSectorIdsRef = useRef<number[]>([]);
	const datesSectionRef = useRef<HTMLDivElement>(null);
	const [isPending, startTransition] = useTransition();
	const [pendingSectorRemoval, setPendingSectorRemoval] = useState<{
		index: number;
		standsCount: number;
	} | null>(null);

	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: festival.name,
			status: festival.status ?? "draft",
			mapsVersion: festival.mapsVersion ?? "v1",
			publicRegistration: festival.publicRegistration ?? false,
			eventDayRegistration: festival.eventDayRegistration ?? false,
			keepStoreOpen: festival.keepStoreOpen ?? false,
			festivalType: festival.festivalType,
			description: festival.description || "",
			address: festival.address || "",
			locationLabel: festival.locationLabel || "",
			locationUrl: festival.locationUrl || "",
			generalMapUrl: festival.generalMapUrl || "",
			mascotUrl: festival.mascotUrl || "",
			illustrationPaymentQrCodeUrl: festival.illustrationPaymentQrCodeUrl || "",
			gastronomyPaymentQrCodeUrl: festival.gastronomyPaymentQrCodeUrl || "",
			entrepreneurshipPaymentQrCodeUrl:
				festival.entrepreneurshipPaymentQrCodeUrl || "",
			illustrationStandUrl: festival.illustrationStandUrl || "",
			gastronomyStandUrl: festival.gastronomyStandUrl || "",
			entrepreneurshipStandUrl: festival.entrepreneurshipStandUrl || "",
			festivalCode: festival.festivalCode || "",
			festivalBannerUrl: festival.festivalBannerUrl || "",
			dates: festival.festivalDates.map((date) => ({
				id: date.id,
				date: DateTime.fromJSDate(date.startDate).toFormat("yyyy-MM-dd"),
				startTime: date.startDate.toTimeString().slice(0, 5),
				endTime: date.endDate.toTimeString().slice(0, 5),
			})),
			festivalSectors: festival.festivalSectors.map((sector) => ({
				id: sector.id,
				name: sector.name,
				orderInFestival: sector.orderInFestival,
				mapUrl: sector.mapUrl || "",
				mascotUrl: sector.mascotUrl || "",
			})),
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

	const addNewSector = () => {
		const currentSectors = form.getValues("festivalSectors");
		const highestOrder = currentSectors.reduce((maxOrder, sector) => {
			const currentOrder = Number(sector.orderInFestival);
			if (!Number.isFinite(currentOrder)) return maxOrder;
			return Math.max(maxOrder, currentOrder);
		}, 0);

		appendSector({
			name: "",
			orderInFestival: highestOrder + 1,
			mapUrl: "",
			mascotUrl: "",
		});
	};

	function removeSectorAtIndex(index: number) {
		const sector = form.getValues(`festivalSectors.${index}`);
		if (sector?.id) {
			deletedSectorIdsRef.current.push(sector.id);
		}
		removeSector(index);
	}

	function handleRemoveSector(index: number) {
		const sector = form.getValues(`festivalSectors.${index}`);
		const currentSectorUsage = (festival.festivalSectors as SectorUsage[]).find(
			(existingSector) => existingSector.id === sector?.id,
		);
		const standsCount = currentSectorUsage?.stands?.length ?? 0;
		const hasReservations =
			currentSectorUsage?.stands?.some(
				(stand) => (stand.reservations?.length ?? 0) > 0,
			) ?? false;

		if (hasReservations) {
			toast.error(
				"No puedes eliminar este sector porque tiene stands con reservaciones. Elimina primero esas reservaciones.",
			);
			return;
		}

		if (standsCount > 0) {
			setPendingSectorRemoval({ index, standsCount });
			return;
		}

		removeSectorAtIndex(index);
	}

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
				id: dateItem.id,
				date: new Date(dateItem.date),
				startTime: dateItem.startTime,
				endTime: dateItem.endTime,
				startDateUTC: startDateTime.toUTC().toJSDate(),
				endDateUTC: endDateTime.toUTC().toJSDate(),
			};
		});

		const festivalData = {
			...data,
			id: festival.id,
			deletedSectorIds: deletedSectorIdsRef.current,
			dates: processedDates.map((d) => ({
				id: d.id,
				date: d.date,
				startTime: d.startTime,
				endTime: d.endTime,
			})),
			dateDetails: processedDates.map((d) => ({
				startDate: d.startDateUTC,
				endDate: d.endDateUTC,
			})),
			updatedAt: new Date(),
		};

		startTransition(async () => {
			try {
				const result = await updateFestival(festivalData);
				if (result.success) {
					toast.success(result.message);
					router.push("/dashboard/festivals");
				} else {
					toast.error(result.message);
				}
			} catch (error) {
				toast.error(
					"Error al actualizar el festival. Por favor, intenta nuevamente.",
				);
			}
		});
	};

	const onInvalidSubmit = (errors: FieldErrors<z.input<typeof FormSchema>>) => {
		const firstErrorMessage = getFirstErrorMessage(errors);
		toast.error(
			firstErrorMessage || "Completa los campos requeridos antes de guardar.",
		);
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

								<FormField
									control={form.control}
									name="keepStoreOpen"
									render={({ field }) => (
										<FormItem className="flex flex-row items-start justify-between gap-4 rounded-lg border p-4">
											<div className="space-y-1">
												<FormLabel>Mantener la tiendita abierta</FormLabel>
												<p className="text-sm text-muted-foreground">
													Por defecto, la tiendita en línea y el checkout se
													bloquean durante los días del festival. Actívalo para
													permitir que los visitantes sigan comprando en línea
													mientras el festival está en curso.
												</p>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
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
													onClick={() => handleRemoveSector(index)}
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
											{/* Map URL Upload */}
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

											{/* Mascot URL Upload */}
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
									onClick={addNewSector}
								>
									<PlusIcon className="mr-2 h-4 w-4" />
									Agregar otro sector
								</Button>
							</div>

							<Button
								type="submit"
								size="lg"
								className="w-full md:w-auto"
								disabled={isSubmitting || isPending || !form.formState.isDirty}
							>
								{(isSubmitting || isPending) && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								{isSubmitting || isPending
									? "Actualizando Festival"
									: "Actualizar Festival"}
							</Button>
						</CardContent>
					</Card>
				</form>
			</Form>
			<AlertDialog
				open={pendingSectorRemoval !== null}
				onOpenChange={(open) => {
					if (open) return;
					setPendingSectorRemoval(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Eliminar sector con stands</AlertDialogTitle>
						<AlertDialogDescription>
							Este sector tiene {pendingSectorRemoval?.standsCount ?? 0} stands
							creados. Si lo eliminas, también se eliminarán esos stands.
							¿Deseas continuar?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingSectorRemoval) {
									removeSectorAtIndex(pendingSectorRemoval.index);
								}
								setPendingSectorRemoval(null);
							}}
						>
							Eliminar sector
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

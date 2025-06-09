"use client";
import { Button } from "@/app/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { createFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import TextareaInput from '@/app/components/form/fields/textarea';
import TextInput from "../../form/fields/text";
import SelectInput from "../../form/fields/select";
import { festivalTypeOptions } from "@/app/lib/utils";
import { festivalTypeEnum } from "@/db/schema";
import { BuildingIcon, CalendarDaysIcon, MapPinIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useFieldArray } from "react-hook-form";
import { DateTime } from 'luxon';
import SectorImageUpload from "../sectors/sector-image-upload";
import {
	Card,
	CardContent,
} from "@/components/ui/card";

const FormSchema = z.object({
	name: z.string().trim().min(2, "El nombre tiene que tener al menos dos letras"),
	status: z.enum(['draft', 'published', 'active', 'archived']).default('draft'),
	publicRegistration: z.boolean().default(false),
	eventDayRegistration: z.boolean().default(false),
	festivalType: z.enum([...festivalTypeEnum.enumValues]),
	dates: z.array(
		z.object({
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			startTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato Invalido (HH:MM)"),
			endTime: z.string().regex(/^\d{2}:\d{2}$/, "Formato Invalido (HH:MM)"),
		})
	).min(1, "AL menos uno es requerido"),
	dateDetails: z.array(
		z.object({
			startDate: z.coerce.date(),
			endDate: z.coerce.date(),
		})
	).optional(),
	description: z.string().trim().optional(),
	address: z.string().trim().optional(),
	locationLabel: z.string().trim().optional(),
	locationUrl: z.string().trim().url().optional().or(z.literal('')),
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
	festivalSectors: z.array(
		z.object({
			name: z.string().min(1, "El nombre del sector es requerido"),
			orderInFestival: z.coerce.number().min(1, "El orden debe ser al menos 1"),
			mapUrl: z.string().optional(),
			mascotUrl: z.string().optional(),
		})
	).min(1, "Debe haber al menos un sector"),
});

export default function NewFestivalForm() {
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
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
			dates: [{
				date: DateTime.local().toFormat('yyyy-MM-dd'),
				startTime: "10:00",
				endTime: "20:00"
			}],
			festivalSectors: [{
				name: "Galería",
				orderInFestival: 1,
				mapUrl: "",
				mascotUrl: ""
			}]
		}
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "dates",
	});
	const {
		fields: sectorFields,
		append: appendSector,
		remove: removeSector
	} = useFieldArray({
		control: form.control,
		name: "festivalSectors",
	});

	const addNewDate = () => {
		append({
			date: DateTime.local().toFormat('yyyy-MM-dd'),
			startTime: "10:00",
			endTime: "20:00"
		});
	};

	const onSubmit = form.handleSubmit(async (data) => {
		const processedDates = data.dates.map(dateItem => {
			const startDateTime = DateTime.fromFormat(
				`${dateItem.date} ${dateItem.startTime}`,
				'yyyy-MM-dd HH:mm',
				{ zone: 'local' }
			);

			const endDateTime = DateTime.fromFormat(
				`${dateItem.date} ${dateItem.endTime}`,
				'yyyy-MM-dd HH:mm',
				{ zone: 'local' }
			);

			return {
				startDate: startDateTime.toUTC().toJSDate(),
				endDate: endDateTime.toUTC().toJSDate(),
			};
		});

		const {
			dates: _,
			...rest
		} = data;

		const result = await createFestival({
			...rest,
			dateDetails: processedDates,
			createdAt: new Date(),
			updatedAt: new Date(),
			reservationsStartDate: new Date(),
		});

		if (result.success) {
			toast.success(result.message);
			router.push("/dashboard/festivals");
		} else {
			toast.error(result.message);
		}
	});

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
									formControl={form.control}
									name="name"
									label="Nombre del festival"
									type="text"
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
								/>
							</div>

							{/* Location Information Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl flex items-center gap-2">
									<MapPinIcon className="w-5 h-5" />
									Información de la Ubicación
								</h3>

								<TextInput
									formControl={form.control}
									name="address"
									label="Dirección"
									type="text"
								/>

								<TextInput
									formControl={form.control}
									name="locationLabel"
									label="Etiqueta de Dirección"
									type="text"
								/>

								<TextInput
									formControl={form.control}
									name="locationUrl"
									label="URL de Dirección"
									type="text"
									placeholder="https://example.com"
								/>
							</div>

							{/* Dates Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl flex items-center gap-2">
									<CalendarDaysIcon className="w-5 h-5" />
									Fechas del Evento
								</h3>

								{fields.map((field, index) => (
									<div key={field.id} className="space-y-4 border-b pb-4 last:border-b-0 last:pb-0">
										<div className="flex justify-between items-center">
											<h4 className="text-sm font-medium">Evento {index + 1}</h4>
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
											formControl={form.control}
											name={`dates.${index}.date`}
											label="Fecha"
											type="date"
										/>

										<div className="grid grid-cols-2 gap-4">
											<FormField
												control={form.control}
												name={`dates.${index}.startTime`}
												render={({ field }) => (
													<FormItem>
														<FormLabel>Hora de inicio</FormLabel>
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
														<FormLabel>Hora de finalización</FormLabel>
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
									Agregar otra fecha
								</Button>
							</div>

							{/* Sectors Section */}
							<div className="space-y-4 p-4 border rounded-lg">
								<h3 className="font-semibold text-xl">Sectores del Festival</h3>

								{sectorFields.map((field, index) => (
									<div key={field.id} className="space-y-4 border-b pb-4 last:border-b-0 last:pb-0">
										<div className="flex justify-between items-center">
											<h4 className="text-sm font-medium">Sector {index + 1}</h4>
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
											formControl={form.control}
											name={`festivalSectors.${index}.name`}
											label="Nombre del Sector"
											type="text"
										/>

										<TextInput
											formControl={form.control}
											name={`festivalSectors.${index}.orderInFestival`}
											label="Orden en el Festival"
											type="number"
											min={1}
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
									onClick={() => appendSector({
										name: "",
										orderInFestival: sectorFields.length + 1,
										mapUrl: "",
										mascotUrl: ""
									})}
								>
									<PlusIcon className="mr-2 h-4 w-4" />
									Agregar otro sector
								</Button>
							</div>

							<Button type="submit" size="lg" className="w-full md:w-auto">
								Agregar Festival
							</Button>
						</CardContent>
					</Card>
				</form>
			</Form>
		</div>
	);
}

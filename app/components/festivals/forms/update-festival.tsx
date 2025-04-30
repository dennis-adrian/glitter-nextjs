"use client";

import { Button } from "@/app/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { festivalTypeOptions } from "@/app/lib/utils";
import { festivalTypeEnum } from "@/db/schema";
import { updateFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import TextInput from "../../form/fields/text";
import TextareaInput from "../../form/fields/textarea";
import { PlusIcon, TrashIcon } from "lucide-react";
import SelectInput from "../../form/fields/select";
import { DateTime } from 'luxon';

const FormSchema = z.object({
	name: z.string().min(1, "Required"),
	status: z.enum(['draft', 'published', 'active', 'archived']).default('draft'),
	mapsVersion: z.enum(['v1', 'v2', 'v3']).default('v1'),
	publicRegistration: z.boolean().default(false),
	eventDayRegistration: z.boolean().default(false),
	festivalType: z.enum([...festivalTypeEnum.enumValues]),
	dates: z.array(
		z.object({
			id: z.number().optional(),
			date: z.coerce.date(),
			startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
			endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
		})
	).min(1, "At least one date is required"),
	dateDetails: z.array(
		z.object({
			startDate: z.coerce.date(),
			endDate: z.coerce.date(),
		})
	).optional(),
	description: z.string().optional(),
	address: z.string().optional(),
	locationLabel: z.string().optional(),
	locationUrl: z.string().url().optional().or(z.literal('')),
});

export default function UpdateFestivalForm({ festival }: { festival: FestivalWithDates }) {
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: festival.name,
			status: festival.status,
			mapsVersion: festival.mapsVersion,
			publicRegistration: festival.publicRegistration,
			eventDayRegistration: festival.eventDayRegistration,
			festivalType: festival.festivalType,
			description: festival.description || '',
			address: festival.address || '',
			locationLabel: festival.locationLabel || '',
			locationUrl: festival.locationUrl || '',
			dates: festival.festivalDates.map(date => ({
				id: date.id,
				date: new Date(date.startDate),
				startTime: date.startDate.toTimeString().slice(0, 5),
				endTime: date.endDate.toTimeString().slice(0, 5),
			})),
		}
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "dates",
	});

	const addNewDate = () => {
		append({
			date: new Date(),
			startTime: "10:00",
			endTime: "20:00"
		});
	};

	const onSubmit = form.handleSubmit(async (data) => {
		// Get user's local timezone (browser will detect)
		const localZone = DateTime.local().zoneName;
		const processedDates = data.dates.map(dateItem => {
			// Parse date and times in local timezone
			const dateStr = DateTime.fromJSDate(dateItem.date).toFormat('yyyy-MM-dd');
			const startDateTime = DateTime.fromFormat(
				`${dateStr} ${dateItem.startTime}`,
				'yyyy-MM-dd HH:mm',
				{ zone: localZone }
			);
			const endDateTime = DateTime.fromFormat(
				`${dateStr} ${dateItem.endTime}`,
				'yyyy-MM-dd HH:mm',
				{ zone: localZone }
			);

			// Adjust end date if it's before start time (spanning midnight)
			const adjustedEndDateTime = endDateTime < startDateTime
				? endDateTime.plus({ days: 1 })
				: endDateTime;

			return {
				id: dateItem.id,
				date: dateItem.date,
				startTime: dateItem.startTime,
				endTime: dateItem.endTime,
				startDateUTC: startDateTime.toUTC().toJSDate(),
				endDateUTC: adjustedEndDateTime.toUTC().toJSDate()
			};
		});

		const festivalData = {
			...data,
			id: festival.id,
			dates: processedDates.map(d => ({
				id: d.id,
				date: d.date,
				startTime: d.startTime,
				endTime: d.endTime
			})),
			dateDetails: processedDates.map(d => ({
				startDate: d.startDateUTC,
				endDate: d.endDateUTC
			})),
			updatedAt: new Date(),
		};

		const result = await updateFestival(festivalData);

		if (result.success) {
			toast.success(result.message);
			router.push("/dashboard/festivals");
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
				{/* Basic Information Section */}
				<div className="space-y-4 p-4 border rounded-lg">
					<h3 className="font-medium">Informacion Básica</h3>

					<TextInput
						formControl={form.control}
						name="name"
						label="Nombre del festival"
						type="text"
					/>

					<TextareaInput formControl={form.control} label="Descripción" name="description" placeholder="Descripción" />

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
					<h3 className="font-medium">Informacion de la Ubicación</h3>

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
					<h3 className="font-medium">Fechas</h3>

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

							<FormField
								control={form.control}
								name={`dates.${index}.date`}
								render={({ field }) => (
									<FormItem>
										<FormLabel>Fecha</FormLabel>
										<FormControl>
											<Input
												type="date"
												{...field}
												value={field.value ? field.value.toISOString().split('T')[0] : ''}
												onChange={e => field.onChange(new Date(e.target.value))}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
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

				<Button type="submit" size="lg" className="w-full md:w-auto">
					Actualizar Festival
				</Button>
			</form>
		</Form>
	);
}

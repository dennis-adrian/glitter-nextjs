"use client";

import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarIcon, PlusIcon, TrashIcon } from "lucide-react";

import {
	createFestivalActivity,
	updateFestivalActivity,
	type FestivalActivityInput,
} from "@/app/lib/festival_activites/admin-actions";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import SelectInput from "@/app/components/form/fields/select";
import SectorImageUpload from "@/app/components/festivals/sectors/sector-image-upload";

const CATEGORY_SELECT_OPTIONS = [
	{ value: "illustration", label: "Ilustración" },
	{ value: "gastronomy", label: "Gastronomía" },
	{ value: "entrepreneurship", label: "Emprendimiento Creativo" },
	{ value: "new_artist", label: "Nuevo Artista" },
];

const ACTIVITY_TYPE_OPTIONS = [
	{ value: "stamp_passport", label: "Carrera de Sellos" },
	{ value: "sticker_print", label: "Impresión de Stickers" },
	{ value: "best_stand", label: "Mejor Stand" },
	{ value: "festival_sticker", label: "Sticker del Festival" },
	{ value: "coupon_book", label: "Cuponera de Descuentos" },
];

const PROOF_TYPE_OPTIONS = [
	{ value: "image", label: "Imagen" },
	{ value: "text", label: "Texto" },
	{ value: "both", label: "Imagen y texto" },
];

const ACCESS_LEVEL_OPTIONS = [
	{ value: "public", label: "Público" },
	{
		value: "festival_participants_only",
		label: "Solo participantes del festival",
	},
];

const CATEGORY_VALUES = [
	"illustration",
	"gastronomy",
	"entrepreneurship",
	"new_artist",
] as const;

const DetailSchema = z.object({
	id: z.number().optional(),
	description: z.string().optional(),
	participationLimit: z.coerce
		.number()
		.int()
		.positive()
		.optional()
		.or(z.literal("").transform(() => undefined)),
	category: z.enum(CATEGORY_VALUES).nullable().optional(),
});

const WAITLIST_WINDOW_PRESETS = [
	{ label: "30 minutos", value: 30 },
	{ label: "1 hora", value: 60 },
	{ label: "2 horas", value: 120 },
	{ label: "6 horas", value: 360 },
	{ label: "24 horas", value: 1440 },
	{ label: "Personalizado", value: -1 },
];

const FormSchema = z.object({
	name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
	description: z.string().trim().optional(),
	visitorsDescription: z.string().trim().optional(),
	type: z.enum([
		"stamp_passport",
		"sticker_print",
		"best_stand",
		"festival_sticker",
		"coupon_book",
	]),
	accessLevel: z.enum(["public", "festival_participants_only"]),
	promotionalArtUrl: z.string().optional(),
	activityPrizeUrl: z.string().optional(),
	registrationStartDate: z.string().min(1, "Requerido"),
	registrationEndDate: z.string().min(1, "Requerido"),
	proofType: z.enum(["image", "text", "both"]).nullable().optional(),
	proofUploadLimitDate: z.string().optional(),
	allowsVoting: z.boolean().default(false),
	votingStartDate: z.string().optional(),
	votingEndDate: z.string().optional(),
	waitlistEnabled: z.boolean().default(false),
	waitlistWindowMinutes: z.coerce.number().int().positive().optional(),
	details: z.array(DetailSchema).min(1, "Debe haber al menos una variante"),
});

type FormValues = z.infer<typeof FormSchema>;

function toDatetimeLocal(date: Date | null | undefined): string {
	if (!date) return "";
	const d = new Date(date);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDefaultValues(
	activity?: FestivalActivityWithDetailsAndParticipants,
): FormValues {
	if (!activity) {
		return {
			name: "",
			description: "",
			visitorsDescription: "",
			type: "stamp_passport",
			accessLevel: "public",
			promotionalArtUrl: "",
			activityPrizeUrl: "",
			registrationStartDate: "",
			registrationEndDate: "",
			proofType: null,
			proofUploadLimitDate: "",
			allowsVoting: false,
			votingStartDate: "",
			votingEndDate: "",
			waitlistEnabled: false,
			waitlistWindowMinutes: undefined,
			details: [
				{
					description: "",
					participationLimit: undefined,
				},
			],
		};
	}

	return {
		name: activity.name,
		description: activity.description ?? "",
		visitorsDescription: activity.visitorsDescription ?? "",
		type: activity.type,
		accessLevel: activity.accessLevel,
		promotionalArtUrl: activity.promotionalArtUrl ?? "",
		activityPrizeUrl: activity.activityPrizeUrl ?? "",
		registrationStartDate: toDatetimeLocal(activity.registrationStartDate),
		registrationEndDate: toDatetimeLocal(activity.registrationEndDate),
		proofType: activity.proofType ?? null,
		proofUploadLimitDate: toDatetimeLocal(activity.proofUploadLimitDate),
		allowsVoting: activity.allowsVoting,
		votingStartDate: toDatetimeLocal(activity.votingStartDate),
		votingEndDate: toDatetimeLocal(activity.votingEndDate),
		waitlistEnabled: activity.waitlistWindowMinutes !== null && activity.waitlistWindowMinutes !== undefined,
		waitlistWindowMinutes: activity.waitlistWindowMinutes ?? undefined,
		details: activity.details.map((d) => ({
			id: d.id,
			description: d.description ?? "",
			participationLimit: d.participationLimit ?? undefined,
			category: d.category && d.category !== "none" ? d.category : null,
		})),
	};
}

type FestivalActivityFormProps = {
	festivalId: number;
	activity?: FestivalActivityWithDetailsAndParticipants;
};

export default function FestivalActivityForm({
	festivalId,
	activity,
}: FestivalActivityFormProps) {
	const router = useRouter();
	const isEditing = !!activity;

	const form = useForm({
		resolver: zodResolver(FormSchema),
		defaultValues: buildDefaultValues(activity),
	});

	const {
		fields: detailFields,
		append: appendDetail,
		remove: removeDetail,
	} = useFieldArray({ control: form.control, name: "details" });

	const proofType = form.watch("proofType");
	const allowsVoting = form.watch("allowsVoting");
	const waitlistEnabled = form.watch("waitlistEnabled");
	const formErrors = form.formState.errors;

	const onSubmit = form.handleSubmit(
		async (data) => {
			const toDate = (str: string | undefined) =>
				str ? new Date(str) : undefined;

			const details = data.details.map(
				(d: {
					id?: number;
					description?: string;
					participationLimit?: number;
					category?: string | null;
				}) => ({
					id: d.id,
					description: d.description,
					participationLimit: d.participationLimit,
					category: (d.category ?? null) as
						| "illustration"
						| "gastronomy"
						| "entrepreneurship"
						| "new_artist"
						| null,
				}),
			);

			const payload = {
				name: data.name,
				description: data.description,
				visitorsDescription: data.visitorsDescription,
				type: data.type,
				accessLevel: data.accessLevel,
				promotionalArtUrl: data.promotionalArtUrl,
				activityPrizeUrl: data.activityPrizeUrl,
				registrationStartDate: new Date(data.registrationStartDate),
				registrationEndDate: new Date(data.registrationEndDate),
				proofType: data.proofType ?? null,
				proofUploadLimitDate: toDate(data.proofUploadLimitDate),
				allowsVoting: data.allowsVoting,
				votingStartDate: toDate(data.votingStartDate),
				votingEndDate: toDate(data.votingEndDate),
				waitlistWindowMinutes: data.waitlistEnabled
					? (data.waitlistWindowMinutes ?? null)
					: null,
				details,
			};

			const result = isEditing
				? await updateFestivalActivity(
						activity.id,
						festivalId,
						payload as FestivalActivityInput,
					)
				: await createFestivalActivity(
						festivalId,
						payload as FestivalActivityInput,
					);

			if (result.success) {
				toast.success(result.message);
				router.push(`/dashboard/festivals/${festivalId}/festival_activities`);
			} else {
				toast.error(result.message);
			}
		},
		(errors) => {
			console.error("Form validation errors:", errors);
		},
	);

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} className="space-y-6 max-w-3xl mx-auto">
				{/* Basic Info */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<h3 className="font-semibold text-lg">Información básica</h3>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nombre</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Descripción (card de actividad)</FormLabel>
									<FormControl>
										<Textarea className="resize-none" rows={2} {...field} />
									</FormControl>
									<FormDescription>
										Texto corto que aparece en la card de actividades del
										dashboard del participante.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="visitorsDescription"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Descripción para visitantes</FormLabel>
									<FormControl>
										<Textarea className="resize-none" rows={3} {...field} />
									</FormControl>
									<FormDescription>
										Texto explicativo que aparece en la página de detalle de la
										actividad, visible para todos.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<SelectInput
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							formControl={form.control as any}
							name="type"
							label="Tipo de actividad"
							options={ACTIVITY_TYPE_OPTIONS}
						/>

						<SelectInput
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							formControl={form.control as any}
							name="accessLevel"
							label="Nivel de acceso"
							options={ACCESS_LEVEL_OPTIONS}
						/>
					</CardContent>
				</Card>

				{/* Images */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<h3 className="font-semibold text-lg">Imágenes</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<FormField
								control={form.control}
								name="promotionalArtUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Arte promocional</FormLabel>
										<SectorImageUpload
											imageUrl={field.value || null}
											setImageUrl={field.onChange}
											sectorName="promotional_art"
										/>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="activityPrizeUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Imagen del premio</FormLabel>
										<SectorImageUpload
											imageUrl={field.value || null}
											setImageUrl={field.onChange}
											sectorName="activity_prize"
										/>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Registration Dates */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<h3 className="font-semibold text-lg flex items-center gap-2">
							<CalendarIcon className="w-4 h-4" />
							Fechas de inscripción
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="registrationStartDate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Inicio de inscripción</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="registrationEndDate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Fin de inscripción</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Proof */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<h3 className="font-semibold text-lg">Prueba de participación</h3>
						<FormField
							control={form.control}
							name="proofType"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Tipo de prueba</FormLabel>
									<FormControl>
										<select
											className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
											value={field.value ?? ""}
											onChange={(e) =>
												field.onChange(
													e.target.value === "" ? null : e.target.value,
												)
											}
										>
											<option value="">Sin prueba</option>
											{PROOF_TYPE_OPTIONS.map((opt) => (
												<option key={opt.value} value={opt.value}>
													{opt.label}
												</option>
											))}
										</select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{proofType && (
							<FormField
								control={form.control}
								name="proofUploadLimitDate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Fecha límite para subir prueba</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
					</CardContent>
				</Card>

				{/* Voting */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="font-semibold text-lg">Votación</h3>
							<FormField
								control={form.control}
								name="allowsVoting"
								render={({ field }) => (
									<FormItem>
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
						{allowsVoting && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="votingStartDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Inicio de votación</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="votingEndDate"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Fin de votación</FormLabel>
											<FormControl>
												<Input type="datetime-local" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Waitlist */}
				<Card>
					<CardContent className="pt-6 space-y-4">
						<div className="flex items-center justify-between">
							<div>
								<h3 className="font-semibold text-lg">Lista de espera</h3>
								<p className="text-sm text-muted-foreground">
									Cuando los cupos se llenen, los usuarios pueden unirse a una
									lista de espera.
								</p>
							</div>
							<FormField
								control={form.control}
								name="waitlistEnabled"
								render={({ field }) => (
									<FormItem>
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
						{waitlistEnabled && (
							<FormField
								control={form.control}
								name="waitlistWindowMinutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Ventana de tiempo para inscribirse</FormLabel>
										<FormDescription>
											Cuánto tiempo tiene el usuario para inscribirse una vez
											notificado.
										</FormDescription>
										<div className="flex flex-wrap gap-2 mb-2">
											{WAITLIST_WINDOW_PRESETS.filter((p) => p.value > 0).map(
												(preset) => (
													<Button
														key={preset.value}
														type="button"
														size="sm"
														variant={
															field.value === preset.value
																? "default"
																: "outline"
														}
														onClick={() => field.onChange(preset.value)}
													>
														{preset.label}
													</Button>
												),
											)}
										</div>
										<FormControl>
											<Input
												type="number"
												min={1}
												placeholder="Minutos personalizados"
												value={(field.value as number | undefined) ?? ""}
												onChange={(e) =>
													field.onChange(
														e.target.value === ""
															? undefined
															: Number(e.target.value),
													)
												}
												onBlur={field.onBlur}
												name={field.name}
												ref={field.ref}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
					</CardContent>
				</Card>

				{/* Activity Details / Variants */}
				<Card>
					<CardContent className="pt-6 space-y-6">
						<h3 className="font-semibold text-lg">Variantes</h3>
						<p className="text-sm text-muted-foreground">
							Cada variante puede tener un límite de cupos y una categoría
							específica (ej: Mejor Stand por categoría).
						</p>

						{detailFields.map((field, index) => (
							<VariantSection
								key={field.id}
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								form={form as any}
								index={index}
								onRemove={() => removeDetail(index)}
								canRemove={detailFields.length > 1}
							/>
						))}

						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() =>
								appendDetail({
									description: "",
									participationLimit: undefined,
									category: null,
								})
							}
						>
							<PlusIcon className="w-4 h-4 mr-1" />
							Agregar variante
						</Button>
					</CardContent>
				</Card>

				{/* Validation error summary */}
				{Object.keys(formErrors).length > 0 && (
					<p className="text-sm text-destructive">
						Hay errores en el formulario. Revisá los campos marcados en rojo.
					</p>
				)}

				<Button
					type="submit"
					size="lg"
					className="w-full md:w-auto"
					disabled={form.formState.isSubmitting}
				>
					{form.formState.isSubmitting
						? isEditing
							? "Guardando..."
							: "Creando..."
						: isEditing
							? "Guardar cambios"
							: "Crear actividad"}
				</Button>
			</form>
		</Form>
	);
}

type VariantSectionProps = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: ReturnType<typeof useForm<any>>;
	index: number;
	onRemove: () => void;
	canRemove: boolean;
};

function VariantSection({
	form,
	index,
	onRemove,
	canRemove,
}: VariantSectionProps) {
	return (
		<div className="border rounded-lg p-4 space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-medium text-sm">Variante {index + 1}</h4>
				{canRemove && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={onRemove}
						className="text-destructive hover:text-destructive"
					>
						<TrashIcon className="w-4 h-4" />
					</Button>
				)}
			</div>

			<FormField
				control={form.control}
				name={`details.${index}.description`}
				render={({ field }: { field: any }) => (
					<FormItem>
						<FormLabel>Descripción (opcional)</FormLabel>
						<FormControl>
							<Input {...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name={`details.${index}.participationLimit`}
				render={({ field }: { field: any }) => (
					<FormItem>
						<FormLabel>Límite de participantes (opcional)</FormLabel>
						<FormControl>
							<Input
								type="number"
								min={1}
								{...field}
								value={field.value ?? ""}
								onChange={(e) =>
									field.onChange(
										e.target.value === "" ? undefined : Number(e.target.value),
									)
								}
							/>
						</FormControl>
						<FormDescription>
							Dejá en blanco para cupos ilimitados.
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* Category for this variant */}
			<FormField
				control={form.control}
				name={`details.${index}.category`}
				render={({ field }: { field: any }) => (
					<FormItem>
						<FormLabel>Categoría</FormLabel>
						<FormDescription>
							Categoría de participantes para esta variante. Dejá en blanco si
							aplica a todas.
						</FormDescription>
						<FormControl>
							<select
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								value={field.value ?? ""}
								onChange={(e) =>
									field.onChange(e.target.value === "" ? null : e.target.value)
								}
							>
								<option value="">Todas las categorías</option>
								{CATEGORY_SELECT_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>
		</div>
	);
}

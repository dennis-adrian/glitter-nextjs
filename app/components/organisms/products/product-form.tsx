"use client";

import DateInput from "@/app/components/form/fields/date";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form, FormLabel } from "@/app/components/ui/form";
import { Progress } from "@/app/components/ui/progress";
import { Switch } from "@/app/components/ui/switch";
import { useUploadThing } from "@/app/vendors/uploadthing";
import { createProduct, updateProduct } from "@/app/lib/products/actions";
import { deleteProductImage } from "@/app/lib/products/image-actions";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, StarIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	name: z.string().trim().min(1, "El nombre es requerido"),
	description: z.string().trim().optional(),
	price: z
		.string()
		.trim()
		.min(1, "El precio es requerido")
		.transform(Number)
		.pipe(z.number().min(0, "El precio debe ser mayor o igual a 0")),
	stock: z
		.string()
		.trim()
		.min(1, "El stock es requerido")
		.transform(Number)
		.pipe(z.number().int().min(0, "El stock debe ser mayor o igual a 0")),
	status: z.enum(["available", "presale", "sale"]),
	discount: z.string().transform(Number).pipe(z.number().min(0)).optional(),
	discountUnit: z.enum(["percentage", "amount"]),
	isPreOrder: z.boolean(),
	availableDate: z.string().optional().nullable(),
	isFeatured: z.boolean(),
	isNew: z.boolean(),
});

const MAX_IMAGE_SIZE_MB = 4;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;

/** Returns a local YYYY-MM-DD string from a Date or passes through an existing YYYY-MM-DD string. */
function toLocalDateString(value: Date | string | null | undefined): string | null {
	if (value == null) return null;
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

type ImageItem = {
	id: number;
	url: string;
	isMain: boolean;
};

type UploadingItem = {
	tempId: string;
	fileName: string;
	progress: number;
};

type ProductFormProps = {
	product?: BaseProductWithImages;
};

export default function ProductForm({ product }: ProductFormProps) {
	const router = useRouter();
	const isEditing = !!product;

	const initialImages: ImageItem[] =
		product?.images
			.filter((img) => img.uploadStatus === "active")
			.map((img) => ({ id: img.id, url: img.imageUrl, isMain: img.isMain })) ??
		[];

	const [images, setImages] = useState<ImageItem[]>(initialImages);
	const [hasImageChanges, setHasImageChanges] = useState(false);

	// Sync images when product identity changes (e.g. navigation to different product without remount)
	useEffect(() => {
		const nextImages: ImageItem[] =
			product?.images
				?.filter((img) => img.uploadStatus === "active")
				.map((img) => ({
					id: img.id,
					url: img.imageUrl,
					isMain: img.isMain,
				})) ?? [];
		setImages(nextImages);
	}, [product?.id]);

	const [uploadQueue, setUploadQueue] = useState<File[]>([]);
	const [currentlyUploading, setCurrentlyUploading] =
		useState<UploadingItem | null>(null);
	const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

	const startUploadRef = useRef<
		((files: File[]) => Promise<unknown> | void) | null
	>(null);

	const { startUpload } = useUploadThing("productImage", {
		onUploadProgress: (p) => {
			setCurrentlyUploading((prev) => (prev ? { ...prev, progress: p } : null));
		},
		onClientUploadComplete: (res) => {
			const serverData = res?.[0]?.serverData as
				| { imageUrl: string; imageId: number }
				| undefined;
			if (!serverData) return;
			const { imageUrl, imageId } = serverData;
			setImages((prev) => [
				...prev,
				{ id: imageId, url: imageUrl, isMain: prev.length === 0 },
			]);
			setHasImageChanges(true);
			setCurrentlyUploading(null);
		},
		onUploadError: (err) => {
			toast.error(`Error al subir imagen: ${err.message}`);
			setCurrentlyUploading(null);
		},
	});

	useEffect(() => {
		startUploadRef.current = startUpload;
	}, [startUpload]);

	// Process upload queue sequentially for per-file progress tracking
	useEffect(() => {
		if (currentlyUploading !== null || uploadQueue.length === 0) return;
		const [next, ...rest] = uploadQueue;
		setUploadQueue(rest);
		setCurrentlyUploading({
			tempId: crypto.randomUUID(),
			fileName: next.name,
			progress: 0,
		});
		startUploadRef.current?.([next]);
	}, [currentlyUploading, uploadQueue]);

	const form = useForm<
		z.input<typeof FormSchema>,
		unknown,
		z.output<typeof FormSchema>
	>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			name: product?.name ?? "",
			description: product?.description ?? "",
			price: String(product?.price ?? 0),
			stock: String(product?.stock ?? 0),
			status: product?.status ?? "available",
			discount:
				product?.discount !== undefined ? String(product.discount) : "0",
			discountUnit: product?.discountUnit ?? "percentage",
			isPreOrder: product?.isPreOrder ?? false,
			availableDate: toLocalDateString(product?.availableDate ?? null),
			isFeatured: product?.isFeatured ?? false,
			isNew: product?.isNew ?? true,
		},
	});

	// Reset form to new product values when product identity changes (e.g. switching products without remount)
	useEffect(() => {
		form.reset({
			name: product?.name ?? "",
			description: product?.description ?? "",
			price: String(product?.price ?? 0),
			stock: String(product?.stock ?? 0),
			status: product?.status ?? "available",
			discount:
				product?.discount !== undefined ? String(product.discount) : "0",
			discountUnit: product?.discountUnit ?? "percentage",
			isPreOrder: product?.isPreOrder ?? false,
			availableDate: toLocalDateString(product?.availableDate ?? null),
			isFeatured: product?.isFeatured ?? false,
			isNew: product?.isNew ?? true,
		});
	}, [product?.id]);

	const isPreOrder = form.watch("isPreOrder");

	function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;

		const availableSlots =
			MAX_IMAGE_COUNT -
			images.length -
			(currentlyUploading ? 1 : 0) -
			uploadQueue.length;

		const validFiles: File[] = [];
		const oversizedNames: string[] = [];

		for (const file of files.slice(0, availableSlots)) {
			if (file.size > MAX_IMAGE_SIZE_BYTES) {
				oversizedNames.push(file.name);
			} else {
				validFiles.push(file);
			}
		}

		if (oversizedNames.length > 0) {
			toast.error(
				`${oversizedNames.length === 1 ? "La imagen" : "Las imágenes"} ${oversizedNames.join(", ")} ${oversizedNames.length === 1 ? "supera" : "superan"} el límite de ${MAX_IMAGE_SIZE_MB}MB.`,
			);
		}

		e.target.value = "";
		if (validFiles.length === 0) return;

		setUploadQueue((prev) => [...prev, ...validFiles]);
	}

	function setMain(id: number) {
		setImages((prev) => prev.map((img) => ({ ...img, isMain: img.id === id })));
		setHasImageChanges(true);
	}

	async function handleDelete(imageId: number) {
		setDeletingIds((prev) => new Set(prev).add(imageId));
		try {
			const res = await deleteProductImage(imageId);
			if (res.success) {
				setImages((prev) => {
					const next = prev.filter((img) => img.id !== imageId);
					if (next.length > 0 && !next.some((img) => img.isMain)) {
						next[0].isMain = true;
					}
					return next;
				});
				setHasImageChanges(true);
			} else {
				toast.error(res.message);
			}
		} catch {
			toast.error("No se pudo eliminar la imagen.");
		} finally {
			setDeletingIds((prev) => {
				const s = new Set(prev);
				s.delete(imageId);
				return s;
			});
		}
	}

	const totalImageCount =
		images.length + (currentlyUploading ? 1 : 0) + uploadQueue.length;
	const canAddMore = totalImageCount < MAX_IMAGE_COUNT;

	const action = form.handleSubmit(async (data) => {
		const imagePayloads = images.map((img) => ({
			id: img.id,
			isMain: img.isMain,
		}));
		if (imagePayloads.length > 0 && !imagePayloads.some((img) => img.isMain)) {
			imagePayloads[0].isMain = true;
		}

		const payload = {
			...data,
			availableDate:
				data.isPreOrder && data.availableDate ? data.availableDate : null,
			imagePayloads,
		};

		const res = isEditing
			? await updateProduct(product.id, payload)
			: await createProduct(payload);

		if (res.success) {
			toast.success(res.message);
			router.push("/dashboard/store/products");
		} else {
			toast.error(res.message);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={action} className="flex flex-col gap-6 pb-24 md:pb-0">
				{/* Images — at the top */}
				<div className="flex flex-col gap-3">
					<FormLabel>Imágenes del producto</FormLabel>
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{/* Uploaded images */}
						{images.map((img) => {
							const isDeleting = deletingIds.has(img.id);
							return (
								<div key={img.id} className="relative group">
									<div
										className={`relative aspect-square rounded-md overflow-hidden border-2 ${
											img.isMain ? "border-primary" : "border-transparent"
										} ${isDeleting ? "opacity-50" : ""}`}
									>
										<Image
											src={img.url}
											alt="Imagen del producto"
											fill
											className="object-cover"
										/>
									</div>
									{!isDeleting && (
										<div className="absolute top-1 right-1 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
											{!img.isMain && (
												<button
													type="button"
													onClick={() => setMain(img.id)}
													className="rounded bg-white/90 p-1 shadow"
													title="Establecer como imagen principal"
												>
													<StarIcon className="h-3 w-3 text-amber-500" />
												</button>
											)}
											<button
												type="button"
												onClick={() => handleDelete(img.id)}
												className="rounded bg-white/90 p-1 shadow"
												title="Eliminar imagen"
											>
												<XIcon className="h-3 w-3 text-red-500" />
											</button>
										</div>
									)}
									{img.isMain && (
										<div className="absolute bottom-1 left-1">
											<span className="rounded bg-primary px-1 py-0.5 text-xs text-primary-foreground">
												Principal
											</span>
										</div>
									)}
								</div>
							);
						})}

						{/* Currently uploading */}
						{currentlyUploading && (
							<div
								key={currentlyUploading.tempId}
								className="aspect-square rounded-md border bg-muted flex flex-col items-center justify-center gap-2 p-3"
							>
								<p className="text-xs text-center text-muted-foreground truncate w-full">
									{currentlyUploading.fileName}
								</p>
								<Progress
									value={currentlyUploading.progress}
									className="h-1.5"
								/>
								<span className="text-xs text-muted-foreground">
									{currentlyUploading.progress}%
								</span>
							</div>
						)}

						{/* Queued (waiting to upload) */}
						{uploadQueue.map((file, i) => (
							<div
								key={i}
								className="aspect-square rounded-md border bg-muted flex flex-col items-center justify-center gap-2 p-3"
							>
								<p className="text-xs text-center text-muted-foreground truncate w-full">
									{file.name}
								</p>
								<Progress value={0} className="h-1.5" />
							</div>
						))}

						{/* Add button */}
						{canAddMore && (
							<label className="aspect-square rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
								<PlusIcon className="h-6 w-6 text-muted-foreground" />
								<input
									type="file"
									accept="image/*"
									multiple
									className="sr-only"
									onChange={handleFileSelect}
								/>
							</label>
						)}
					</div>
					<p className="text-xs text-muted-foreground">
						Máximo {MAX_IMAGE_SIZE_MB}MB por imagen · hasta {MAX_IMAGE_COUNT}{" "}
						imágenes
					</p>
				</div>

				<div className="grid gap-4">
					<TextInput
						formControl={form.control}
						label="Nombre"
						name="name"
						placeholder="Nombre del producto"
					/>
					<TextareaInput
						formControl={form.control}
						label="Descripción"
						name="description"
						placeholder="Descripción del producto"
						maxLength={500}
					/>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<TextInput
						formControl={form.control}
						label="Precio (Bs.)"
						name="price"
						type="number"
						inputMode="decimal"
						min={0}
						step={0.01}
					/>
					<TextInput
						formControl={form.control}
						label="Stock"
						name="stock"
						type="number"
						inputMode="numeric"
						min={0}
					/>
				</div>

				<SelectInput
					formControl={form.control}
					label="Estado"
					name="status"
					options={[
						{ value: "available", label: "Disponible" },
						{ value: "presale", label: "Preventa" },
						{ value: "sale", label: "En oferta" },
					]}
				/>

				<div className="grid gap-4 sm:grid-cols-2">
					<TextInput
						formControl={form.control}
						label="Descuento"
						name="discount"
						type="number"
						inputMode="decimal"
						min={0}
						step={0.01}
					/>
					<SelectInput
						formControl={form.control}
						label="Tipo de descuento"
						name="discountUnit"
						options={[
							{ value: "percentage", label: "Porcentaje (%)" },
							{ value: "amount", label: "Monto fijo (Bs.)" },
						]}
					/>
				</div>

				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-3">
						<Switch
							id="isPreOrder"
							checked={isPreOrder}
							onCheckedChange={(v) =>
								form.setValue("isPreOrder", v, {
									shouldDirty: true,
									shouldValidate: true,
								})
							}
						/>
						<FormLabel htmlFor="isPreOrder">Es pre-venta</FormLabel>
					</div>
					{isPreOrder && (
						<DateInput
							formControl={form.control}
							label="Fecha de disponibilidad"
							name="availableDate"
						/>
					)}
					<div className="flex items-center gap-3">
						<Switch
							id="isFeatured"
							checked={form.watch("isFeatured")}
							onCheckedChange={(v) =>
								form.setValue("isFeatured", v, {
									shouldDirty: true,
									shouldValidate: true,
								})
							}
						/>
						<FormLabel htmlFor="isFeatured">Producto destacado</FormLabel>
					</div>
					<div className="flex items-center gap-3">
						<Switch
							id="isNew"
							checked={form.watch("isNew")}
							onCheckedChange={(v) =>
								form.setValue("isNew", v, {
									shouldDirty: true,
									shouldValidate: true,
								})
							}
						/>
						<FormLabel htmlFor="isNew">Producto nuevo</FormLabel>
					</div>
				</div>

				<div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:static md:border-0 md:bg-transparent md:p-0">
					<div className="flex gap-2 max-w-7xl mx-auto">
						<Button
							type="button"
							variant="outline"
							className="flex-1 md:flex-none"
							onClick={() => router.push("/dashboard/store/products")}
						>
							Cancelar
						</Button>
						<SubmitButton
							className="flex-1 md:flex-none"
							disabled={
								form.formState.isSubmitting ||
								currentlyUploading !== null ||
								uploadQueue.length > 0 ||
								(!form.formState.isDirty && !hasImageChanges)
							}
							loading={form.formState.isSubmitting}
							loadingLabel="Guardando..."
						>
							{isEditing ? "Guardar cambios" : "Crear producto"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
}

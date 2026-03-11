"use client";

import DateInput from "@/app/components/form/fields/date";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { Form, FormLabel } from "@/app/components/ui/form";
import { Switch } from "@/app/components/ui/switch";
import { useUploadThing } from "@/app/vendors/uploadthing";
import { createProduct, updateProduct } from "@/app/lib/products/actions";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, ImagePlusIcon, StarIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	name: z.string().trim().min(1, "El nombre es requerido"),
	description: z.string().trim().optional(),
	price: z
		.string()
		.transform(Number)
		.pipe(z.number().min(0, "El precio debe ser mayor o igual a 0")),
	stock: z
		.string()
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

type ImageItem = {
	url: string; // CDN URL for uploaded images, blob URL for pending
	isMain: boolean;
	file?: File; // present only for locally-selected (not yet uploaded) images
};

type ProductFormProps = {
	product?: BaseProductWithImages;
};

export default function ProductForm({ product }: ProductFormProps) {
	const router = useRouter();
	const isEditing = !!product;

	const initialImages: ImageItem[] =
		product?.images.map((img) => ({
			url: img.imageUrl,
			isMain: img.isMain,
		})) ?? [];

	const [images, setImages] = useState<ImageItem[]>(initialImages);
	const [hasImageChanges, setHasImageChanges] = useState(false);

	const { startUpload } = useUploadThing("productImage");

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
			availableDate: product?.availableDate
				? new Date(product.availableDate).toISOString().slice(0, 10)
				: null,
			isFeatured: product?.isFeatured ?? false,
			isNew: product?.isNew ?? true,
		},
	});

	const isPreOrder = form.watch("isPreOrder");

	function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? []);
		if (files.length === 0) return;

		const validFiles: File[] = [];
		const oversizedNames: string[] = [];

		for (const file of files) {
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

		const remainingSlots = MAX_IMAGE_COUNT - images.length;
		if (remainingSlots <= 0) {
			toast.error(`Ya tienes el máximo de ${MAX_IMAGE_COUNT} imágenes.`);
			return;
		}
		if (validFiles.length > remainingSlots) {
			toast.warning(
				`Solo se agregarán ${remainingSlots} imagen(es). Límite: ${MAX_IMAGE_COUNT}.`,
			);
			validFiles.splice(remainingSlots);
		}

		const newImages: ImageItem[] = validFiles.map((file, i) => ({
			url: URL.createObjectURL(file),
			isMain: images.length === 0 && i === 0,
			file,
		}));
		setImages((prev) => {
			const combined = [...prev, ...newImages];
			if (!combined.some((img) => img.isMain)) combined[0].isMain = true;
			return combined;
		});
		setHasImageChanges(true);
	}

	function setMain(url: string) {
		setImages((prev) =>
			prev.map((img) => ({ ...img, isMain: img.url === url })),
		);
		setHasImageChanges(true);
	}

	function removeImage(url: string) {
		setImages((prev) => {
			const target = prev.find((img) => img.url === url);
			if (target?.file) URL.revokeObjectURL(target.url);
			const next = prev.filter((img) => img.url !== url);
			if (next.length > 0 && !next.some((img) => img.isMain)) {
				next[0].isMain = true;
			}
			return next;
		});
		setHasImageChanges(true);
	}

	const action = form.handleSubmit(async (data) => {
		// 1. Upload any locally-selected (pending) images
		const pendingImages = images.filter((img) => !!img.file);
		let resolvedImages = images.filter((img) => !img.file);

		if (pendingImages.length > 0) {
			const uploadResult = await startUpload(
				pendingImages.map((img) => img.file!),
			);

			if (!uploadResult) {
				toast.error("Error al subir las imágenes");
				return;
			}

			const uploadedImages = uploadResult.map((res, i) => ({
				url: res.serverData.imageUrl,
				isMain: pendingImages[i].isMain,
			}));

			pendingImages.forEach((img) => URL.revokeObjectURL(img.url));
			resolvedImages = [...resolvedImages, ...uploadedImages];
		}

		if (
			resolvedImages.length > 0 &&
			!resolvedImages.some((img) => img.isMain)
		) {
			resolvedImages[0].isMain = true;
		}

		const imageUrls = resolvedImages.map((img) => img.url);
		const mainImageUrl =
			resolvedImages.find((img) => img.isMain)?.url ?? imageUrls[0] ?? null;

		// 2. Save product
		const payload = {
			...data,
			availableDate: data.availableDate ? new Date(data.availableDate) : null,
			imageUrls,
			mainImageUrl,
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
							onCheckedChange={(v) => form.setValue("isPreOrder", v)}
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
							onCheckedChange={(v) => form.setValue("isFeatured", v)}
						/>
						<FormLabel htmlFor="isFeatured">Producto destacado</FormLabel>
					</div>
					<div className="flex items-center gap-3">
						<Switch
							id="isNew"
							checked={form.watch("isNew")}
							onCheckedChange={(v) => form.setValue("isNew", v)}
						/>
						<FormLabel htmlFor="isNew">Producto nuevo</FormLabel>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<FormLabel>Imágenes del producto</FormLabel>
					{images.length > 0 && (
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{images.map((img) => (
								<div key={img.url} className="relative group">
									<div
										className={`relative aspect-square rounded-md overflow-hidden border-2 ${img.isMain ? "border-primary" : "border-transparent"}`}
									>
										{img.file ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={img.url}
												alt="Imagen del producto"
												className="object-cover w-full h-full"
											/>
										) : (
											<Image
												src={img.url}
												alt="Imagen del producto"
												fill
												className="object-cover"
											/>
										)}
									</div>
									<div className="absolute top-1 right-1 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
										{!img.isMain && (
											<button
												type="button"
												onClick={() => setMain(img.url)}
												className="rounded bg-white/90 p-1 shadow"
												title="Establecer como imagen principal"
											>
												<StarIcon className="h-3 w-3 text-amber-500" />
											</button>
										)}
										<button
											type="button"
											onClick={() => removeImage(img.url)}
											className="rounded bg-white/90 p-1 shadow"
											title="Eliminar imagen"
										>
											<XIcon className="h-3 w-3 text-red-500" />
										</button>
									</div>
									<div className="absolute bottom-1 left-1 flex flex-col items-start gap-0.5">
										{img.isMain && (
											<span className="rounded bg-primary px-1 py-0.5 text-xs text-primary-foreground">
												Principal
											</span>
										)}
										{img.file && (
											<span className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
												Pendiente
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					)}
					{images.length === 0 && (
						<div className="flex items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
							<ImageIcon className="h-5 w-5" />
							<span>Sin imágenes</span>
						</div>
					)}
					<label
						className={cn(
							buttonVariants({ variant: "outline" }),
							"cursor-pointer w-fit",
						)}
					>
						<ImagePlusIcon className="h-4 w-4 mr-2" />
						Seleccionar imágenes
						<input
							type="file"
							accept="image/*"
							multiple
							className="sr-only"
							onChange={handleFileSelect}
						/>
					</label>
					<p className="text-xs text-muted-foreground">
						Máximo {MAX_IMAGE_SIZE_MB}MB por imagen · hasta {MAX_IMAGE_COUNT}{" "}
						imágenes
					</p>
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

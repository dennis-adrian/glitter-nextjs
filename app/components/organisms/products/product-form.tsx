"use client";

import DateInput from "@/app/components/form/fields/date";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Label } from "@/app/components/ui/label";
import { Progress } from "@/app/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { useUploadThing } from "@/app/vendors/uploadthing";
import { createProduct, updateProduct } from "@/app/lib/products/actions";
import { deleteProductImage } from "@/app/lib/products/image-actions";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { validateProductRentalSettings } from "@/app/lib/rentals/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const VARIANT_KEY_SEPARATOR = "\u001f";

const VariantOptionValueFormSchema = z.object({
  id: z.number().optional(),
  value: z.string().trim().optional(),
});

const VariantOptionFormSchema = z.object({
  id: z.number().optional(),
  name: z.string().trim().optional(),
  selectorDisplay: z.enum(["dropdown", "image", "button"]),
  values: z.array(VariantOptionValueFormSchema),
});

const VariantFormSchema = z.object({
  id: z.number().optional(),
  optionValues: z.array(z.string().trim()),
  price: z.string().trim().optional(),
  stock: z.string().trim().optional(),
  rentalStock: z.string().trim().optional(),
  imageId: z.string().trim().optional(),
  isVisible: z.boolean(),
});

const FormSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido"),
    description: z.string().trim().optional(),
    price: z.string().trim().min(1, "El precio es requerido"),
    stock: z.string().trim().min(1, "El stock es requerido"),
    storeCategory: z.enum(["merch", "supplies"]),
    status: z.enum(["available", "presale", "sale"]),
    discount: z.string().trim().optional(),
    discountUnit: z.enum(["percentage", "amount"]),
    availableDate: z.string().optional().nullable(),
    isFeatured: z.boolean(),
    isNew: z.boolean(),
    isVisible: z.boolean(),
    isPurchasable: z.boolean(),
    isRentable: z.boolean(),
    rentalPrice: z.string().trim().optional(),
    rentalStockMode: z.enum(["shared", "separate"]),
    rentalStock: z.string().trim().optional(),
    hasVariants: z.boolean(),
    variantOptions: z.array(VariantOptionFormSchema),
    variants: z.array(VariantFormSchema),
  })
  .superRefine((values, ctx) => {
    if (!Number.isFinite(Number(values.price)) || Number(values.price) < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El precio debe ser mayor o igual a 0",
        path: ["price"],
      });
    }

    if (
      values.discount &&
      (!Number.isFinite(Number(values.discount)) || Number(values.discount) < 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El descuento debe ser mayor o igual a 0",
        path: ["discount"],
      });
    }

    const rentalValidationError = validateProductRentalSettings({
      isPurchasable: values.isPurchasable,
      isRentable: values.isRentable,
      rentalPrice: values.rentalPrice?.trim()
        ? Number(values.rentalPrice)
        : null,
      rentalStockMode: values.rentalStockMode,
      rentalStock: values.rentalStock?.trim()
        ? Number(values.rentalStock)
        : null,
      hasVariants: values.hasVariants,
      variantRentalStocks: values.hasVariants
        ? values.variants.map((variant) =>
            variant.rentalStock?.trim() ? Number(variant.rentalStock) : null,
          )
        : [],
    });
    if (rentalValidationError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: rentalValidationError,
        path: ["isRentable"],
      });
    }

    if (!values.hasVariants) {
      if (!Number.isInteger(Number(values.stock)) || Number(values.stock) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El stock debe ser mayor o igual a 0",
          path: ["stock"],
        });
      }
      return;
    }

    if (values.variantOptions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agrega al menos una opción",
        path: ["variantOptions"],
      });
    }

    const seenOptionNames = new Set<string>();
    values.variantOptions.forEach((option, optionIndex) => {
      const optionName = option.name?.trim() ?? "";
      if (!optionName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El nombre de la opción es requerido",
          path: ["variantOptions", optionIndex, "name"],
        });
      } else if (seenOptionNames.has(optionName.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Esta opción ya fue agregada",
          path: ["variantOptions", optionIndex, "name"],
        });
      } else {
        seenOptionNames.add(optionName.toLowerCase());
      }

      if (option.values.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Agrega al menos un valor",
          path: ["variantOptions", optionIndex, "values"],
        });
      }

      const seenValues = new Set<string>();
      option.values.forEach((value, valueIndex) => {
        const optionValue = value.value?.trim() ?? "";
        if (!optionValue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "El valor es requerido",
            path: [
              "variantOptions",
              optionIndex,
              "values",
              valueIndex,
              "value",
            ],
          });
        } else if (seenValues.has(optionValue.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Este valor ya fue agregado",
            path: [
              "variantOptions",
              optionIndex,
              "values",
              valueIndex,
              "value",
            ],
          });
        } else {
          seenValues.add(optionValue.toLowerCase());
        }
      });
    });

    if (values.variants.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agrega al menos una combinación",
        path: ["variants"],
      });
    }

    values.variants.forEach((variant, index) => {
      if (variant.optionValues.length !== values.variantOptions.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La combinación no coincide con las opciones",
          path: ["variants", index, "optionValues"],
        });
      }

      if (
        !Number.isInteger(Number(variant.stock)) ||
        Number(variant.stock) < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El stock debe ser mayor o igual a 0",
          path: ["variants", index, "stock"],
        });
      }

      if (
        variant.price &&
        (!Number.isFinite(Number(variant.price)) || Number(variant.price) < 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El precio debe ser mayor o igual a 0",
          path: ["variants", index, "price"],
        });
      }
    });
  });

const MAX_IMAGE_SIZE_MB = 4;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;

/** Returns a local YYYY-MM-DD string from a Date or passes through an existing YYYY-MM-DD string. */
function toLocalDateString(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
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

type ProductFormValues = z.infer<typeof FormSchema>;
type VariantOptionFormValue = ProductFormValues["variantOptions"][number];
type VariantFormValue = ProductFormValues["variants"][number];

function createEmptyOption(): VariantOptionFormValue {
  return {
    name: "",
    selectorDisplay: "dropdown",
    values: [{ value: "" }],
  };
}

function createEmptyVariant(optionValues: string[]): VariantFormValue {
  return {
    optionValues,
    price: "",
    stock: "0",
    imageId: "__none__",
    isVisible: true,
  };
}

function normalizeKeyPart(value: string): string {
  return value.trim().toLowerCase();
}

function getCombinationKey(optionValues: string[]): string {
  return optionValues.map(normalizeKeyPart).join(VARIANT_KEY_SEPARATOR);
}

function getOptionCombinations(options: VariantOptionFormValue[]): string[][] {
  const normalizedValues = options.map((option) =>
    option.values
      .map((value) => value.value?.trim() ?? "")
      .filter((value) => value.length > 0),
  );

  if (
    normalizedValues.length === 0 ||
    normalizedValues.some((values) => values.length === 0)
  ) {
    return [];
  }

  return normalizedValues.reduce<string[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) =>
        values.map((value) => [...combination, value]),
      ),
    [[]],
  );
}

function getVariantLabel(optionValues: string[]): string {
  return optionValues.join(" / ");
}

function buildProductFormValues(
  product: BaseProductWithImages | undefined,
  availableImages: ImageItem[],
): ProductFormValues {
  const variantOptions: VariantOptionFormValue[] =
    product?.options?.map((option) => ({
      id: option.id,
      name: option.name,
      selectorDisplay: option.selectorDisplay,
      values:
        option.values.map((value) => ({
          id: value.id,
          value: value.value,
        })) ?? [],
    })) ?? [];

  const variants: VariantFormValue[] =
    product?.variants?.map((variant) => {
      const optionValues = variantOptions.map((option) => {
        const selection = variant.selections.find(
          (entry) => entry.option.id === option.id,
        );
        return selection?.optionValue.value ?? "";
      });

      return {
        id: variant.id,
        optionValues,
        price: variant.price != null ? String(variant.price) : "",
        stock: String(variant.stock),
        rentalStock:
          variant.rentalStock != null ? String(variant.rentalStock) : "",
        imageId:
          availableImages.find((image) => image.url === variant.imageUrl)?.id !=
          null
            ? String(
                availableImages.find((image) => image.url === variant.imageUrl)
                  ?.id,
              )
            : "__none__",
        isVisible: variant.isVisible,
      };
    }) ?? [];

  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: String(product?.price ?? 0),
    stock: String(product?.stock ?? 0),
    storeCategory: product?.storeCategory ?? "merch",
    status: product?.status ?? "available",
    discount: product?.discount !== undefined ? String(product.discount) : "0",
    discountUnit: product?.discountUnit ?? "percentage",
    availableDate: toLocalDateString(product?.availableDate ?? null),
    isFeatured: product?.isFeatured ?? false,
    isNew: product?.isNew ?? true,
    isVisible: product?.isVisible ?? true,
    isPurchasable: product?.isPurchasable ?? true,
    isRentable: product?.isRentable ?? false,
    rentalPrice:
      product?.rentalPrice != null ? String(product.rentalPrice) : "",
    rentalStockMode: product?.rentalStockMode ?? "shared",
    rentalStock:
      product?.rentalStock != null ? String(product.rentalStock) : "",
    hasVariants: variants.length > 0,
    variantOptions,
    variants,
  };
}

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

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: buildProductFormValues(product, initialImages),
  });

  // Reset form to new product values when product identity changes (e.g. switching products without remount)
  useEffect(() => {
    const nextImages: ImageItem[] =
      product?.images
        ?.filter((img) => img.uploadStatus === "active")
        .map((img) => ({
          id: img.id,
          url: img.imageUrl,
          isMain: img.isMain,
        })) ?? [];

    form.reset(buildProductFormValues(product, nextImages));
  }, [product?.id]);

  const status = form.watch("status");
  const hasVariants = form.watch("hasVariants");
  const variantOptions = form.watch("variantOptions");
  const variants = form.watch("variants");
  const hasVisibleVariant = variants.some((variant) => variant.isVisible);
  const variantOptionSignature = useMemo(
    () =>
      JSON.stringify(
        variantOptions.map((option) => ({
          name: option.name,
          values: option.values.map((value) => value.value),
        })),
      ),
    [variantOptions],
  );

  useEffect(() => {
    if (!hasVariants) return;

    const currentOptions = form.getValues("variantOptions");
    if (currentOptions.length === 0) {
      form.setValue("variantOptions", [createEmptyOption()], {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [form, hasVariants]);

  useEffect(() => {
    if (!hasVariants) return;

    const combinations = getOptionCombinations(
      form.getValues("variantOptions"),
    );
    const currentVariants = form.getValues("variants");
    const variantByKey = new Map(
      currentVariants.map((variant) => [
        getCombinationKey(variant.optionValues),
        variant,
      ]),
    );
    const nextVariants = combinations.map((optionValues) => {
      const existing = variantByKey.get(getCombinationKey(optionValues));
      return existing
        ? {
            ...existing,
            optionValues,
          }
        : createEmptyVariant(optionValues);
    });

    const currentKey = currentVariants
      .map((variant) => getCombinationKey(variant.optionValues))
      .join("|");
    const nextKey = nextVariants
      .map((variant) => getCombinationKey(variant.optionValues))
      .join("|");

    if (currentKey !== nextKey) {
      form.setValue("variants", nextVariants, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [form, hasVariants, variantOptionSignature]);

  function setVariantOptions(nextOptions: VariantOptionFormValue[]) {
    form.setValue("variantOptions", nextOptions, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function updateVariantOption(
    index: number,
    updater: (option: VariantOptionFormValue) => VariantOptionFormValue,
  ) {
    const nextOptions = [...form.getValues("variantOptions")];
    const current = nextOptions[index];
    if (!current) return;
    nextOptions[index] = updater(current);
    setVariantOptions(nextOptions);
  }

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

    const imageUrlById = new Map(
      images.map((img) => [String(img.id), img.url]),
    );
    const normalizedVariants = data.hasVariants
      ? data.variants.map((variant, index) => ({
          id: variant.id,
          optionValues: variant.optionValues.map((value) => value.trim()),
          price: variant.price?.trim() ? Number(variant.price) : null,
          stock: Number(variant.stock),
          rentalStock:
            data.isRentable &&
            data.rentalStockMode === "separate" &&
            variant.rentalStock?.trim()
              ? Number(variant.rentalStock)
              : null,
          imageUrl: variant.imageId
            ? (imageUrlById.get(variant.imageId) ?? null)
            : null,
          isVisible: variant.isVisible,
          sortOrder: index,
        }))
      : [];
    const normalizedVariantOptions = data.hasVariants
      ? data.variantOptions.map((option, optionIndex) => ({
          id: option.id,
          name: option.name?.trim() ?? "",
          selectorDisplay: option.selectorDisplay,
          sortOrder: optionIndex,
          values: option.values.map((value, valueIndex) => ({
            id: value.id,
            value: value.value?.trim() ?? "",
            sortOrder: valueIndex,
          })),
        }))
      : [];

    const payload = {
      name: data.name.trim(),
      description: data.description?.trim() || "",
      price: Number(data.price),
      stock: data.hasVariants ? 0 : Number(data.stock),
      storeCategory: data.storeCategory,
      status: data.status,
      discount: data.discount?.trim() ? Number(data.discount) : 0,
      discountUnit: data.discountUnit,
      availableDate:
        data.status === "presale" && data.availableDate
          ? data.availableDate
          : null,
      isFeatured: data.isFeatured,
      isNew: data.isNew,
      isVisible: data.isVisible,
      isPurchasable: data.isPurchasable,
      isRentable: data.isRentable,
      rentalPrice: data.rentalPrice?.trim() ? Number(data.rentalPrice) : null,
      rentalStockMode: data.rentalStockMode,
      rentalStock:
        data.isRentable &&
        data.rentalStockMode === "separate" &&
        !data.hasVariants &&
        data.rentalStock?.trim()
          ? Number(data.rentalStock)
          : null,
      imagePayloads,
      variantOptions: normalizedVariantOptions,
      variants: normalizedVariants,
    };

    const res = isEditing
      ? await updateProduct(product.id, payload)
      : await createProduct(payload);

    if (res.success) {
      toast.success(res.message);
      if (isEditing) {
        router.push("/dashboard/store/products");
      } else if ("productId" in res && res.productId != null) {
        router.push(`/dashboard/store/products/${res.productId}/edit`);
      } else {
        router.push("/dashboard/store/products");
      }
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="flex flex-col gap-6 pb-24 md:pb-0">
        {/* Images — at the top */}
        <div className="flex flex-col gap-3">
          <Label className="text-muted-foreground">Imágenes del producto</Label>
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
            label="Precio base (Bs.)"
            name="price"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
          />
          {!hasVariants && (
            <TextInput
              label="Stock"
              name="stock"
              type="number"
              inputMode="numeric"
              min={0}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Switch
              id="hasVariants"
              checked={hasVariants}
              onCheckedChange={(value) => {
                if (!value) {
                  const variantStockTotal = form
                    .getValues("variants")
                    .reduce(
                      (sum, variant) => sum + (Number(variant.stock) || 0),
                      0,
                    );
                  form.setValue("stock", String(variantStockTotal), {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }

                form.setValue("hasVariants", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
            />
            <Label
              htmlFor="hasVariants"
              className="text-muted-foreground cursor-pointer"
            >
              Este producto tiene variantes
            </Label>
          </div>

          {hasVariants && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {variantOptions.map((option, optionIndex) => (
                  <div
                    key={option.id ?? optionIndex}
                    className="rounded-lg border border-border/70 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        Opción {optionIndex + 1}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setVariantOptions(
                            variantOptions.filter(
                              (_, index) => index !== optionIndex,
                            ),
                          )
                        }
                        disabled={variantOptions.length === 1}
                        aria-label={`Eliminar opción ${optionIndex + 1}`}
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <TextInput
                        label="Nombre"
                        name={`variantOptions.${optionIndex}.name`}
                        placeholder="Ej: Color"
                      />
                      <SelectInput
                        formControl={form.control}
                        label="Selector en tienda"
                        name={`variantOptions.${optionIndex}.selectorDisplay`}
                        options={[
                          { value: "dropdown", label: "Lista desplegable" },
                          { value: "button", label: "Botones" },
                          { value: "image", label: "Imágenes" },
                        ]}
                      />
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <Label className="text-muted-foreground">Valores</Label>
                      {option.values.map((_, valueIndex) => (
                        <div key={valueIndex} className="flex items-end gap-2">
                          <TextInput
                            className="flex-1"
                            label={valueIndex === 0 ? "Valor" : undefined}
                            name={`variantOptions.${optionIndex}.values.${valueIndex}.value`}
                            placeholder="Ej: Azul"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mb-0.5 h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              updateVariantOption(optionIndex, (current) => ({
                                ...current,
                                values: current.values.filter(
                                  (_, index) => index !== valueIndex,
                                ),
                              }))
                            }
                            disabled={option.values.length === 1}
                            aria-label={`Eliminar valor ${valueIndex + 1}`}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        onClick={() =>
                          updateVariantOption(optionIndex, (current) => ({
                            ...current,
                            values: [...current.values, { value: "" }],
                          }))
                        }
                      >
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Agregar valor
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-fit"
                onClick={() =>
                  setVariantOptions([...variantOptions, createEmptyOption()])
                }
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                Agregar opción
              </Button>

              {variants.length > 0 && !hasVisibleVariant && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Ninguna combinación está visible para compradores.
                </p>
              )}

              {variants.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-medium">Combinaciones</p>
                    <p className="text-xs text-muted-foreground">
                      Cada combinación es una variante con su propio stock,
                      precio e imagen opcional.
                    </p>
                  </div>

                  {variants.map((variant, index) => (
                    <div
                      key={getCombinationKey(variant.optionValues)}
                      className="rounded-lg border border-border/70 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {getVariantLabel(variant.optionValues)}
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <TextInput
                          label="Stock"
                          name={`variants.${index}.stock`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                        />
                        {form.watch("isRentable") &&
                          form.watch("rentalStockMode") === "separate" && (
                            <TextInput
                              label="Stock de alquiler"
                              name={`variants.${index}.rentalStock`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                            />
                          )}
                        <TextInput
                          label="Precio especial (opcional)"
                          name={`variants.${index}.price`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.01}
                          placeholder="Usar precio base"
                        />
                        <FormField
                          control={form.control}
                          name={`variants.${index}.imageId`}
                          render={({ field }) => {
                            const mainImage =
                              images.find((image) => image.isMain) ??
                              images[0] ??
                              null;
                            const selectedImage =
                              images.find(
                                (image) => String(image.id) === field.value,
                              ) ?? null;
                            const triggerImage =
                              field.value === "__none__"
                                ? mainImage
                                : selectedImage;
                            const triggerLabel =
                              field.value === "__none__"
                                ? "Usar imagen principal"
                                : selectedImage?.isMain
                                  ? `Imagen ${selectedImage.id} (principal)`
                                  : selectedImage
                                    ? `Imagen ${selectedImage.id}`
                                    : "Selecciona una imagen";

                            return (
                              <FormItem className="grid gap-2">
                                <FormLabel>Imagen</FormLabel>
                                <Select
                                  value={field.value ?? "__none__"}
                                  onValueChange={field.onChange}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-10">
                                      <div className="flex min-w-0 items-center gap-2">
                                        {triggerImage ? (
                                          <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded border bg-muted">
                                            <Image
                                              src={triggerImage.url}
                                              alt=""
                                              fill
                                              sizes="28px"
                                              className="object-cover"
                                            />
                                          </span>
                                        ) : (
                                          <span className="h-7 w-7 shrink-0 rounded border bg-muted" />
                                        )}
                                        <span className="truncate">
                                          {triggerLabel}
                                        </span>
                                      </div>
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      <div className="flex items-center gap-2">
                                        {mainImage ? (
                                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border bg-muted">
                                            <Image
                                              src={mainImage.url}
                                              alt=""
                                              fill
                                              sizes="36px"
                                              className="object-cover"
                                            />
                                          </span>
                                        ) : (
                                          <span className="h-9 w-9 shrink-0 rounded border bg-muted" />
                                        )}
                                        <span>Usar imagen principal</span>
                                      </div>
                                    </SelectItem>
                                    {images.map((image) => (
                                      <SelectItem
                                        key={image.id}
                                        value={String(image.id)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border bg-muted">
                                            <Image
                                              src={image.url}
                                              alt=""
                                              fill
                                              sizes="36px"
                                              className="object-cover"
                                            />
                                          </span>
                                          <span>
                                            {image.isMain
                                              ? `Imagen ${image.id} (principal)`
                                              : `Imagen ${image.id}`}
                                          </span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <Switch
                          id={`variants.${index}.isVisible`}
                          checked={form.watch(`variants.${index}.isVisible`)}
                          onCheckedChange={(value) =>
                            form.setValue(
                              `variants.${index}.isVisible`,
                              value,
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              },
                            )
                          }
                        />
                        <Label
                          htmlFor={`variants.${index}.isVisible`}
                          className="text-muted-foreground cursor-pointer"
                        >
                          Visible para compradores
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

        <SelectInput
          formControl={form.control}
          label="Categoría de tienda"
          name="storeCategory"
          options={[
            { value: "merch", label: "Merch" },
            { value: "supplies", label: "Insumos" },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
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
          {status === "presale" && (
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
            <Label
              htmlFor="isFeatured"
              className="text-muted-foreground cursor-pointer"
            >
              Producto destacado
            </Label>
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
            <Label
              htmlFor="isNew"
              className="text-muted-foreground cursor-pointer"
            >
              Producto nuevo
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="isVisible"
              checked={form.watch("isVisible")}
              onCheckedChange={(v) =>
                form.setValue("isVisible", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <Label
              htmlFor="isVisible"
              className="text-muted-foreground cursor-pointer"
            >
              Visible en la tienda
            </Label>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-4">
          <p className="text-sm font-medium">Alquiler</p>
          <div className="flex items-center gap-3">
            <Switch
              id="isPurchasable"
              checked={form.watch("isPurchasable")}
              onCheckedChange={(v) =>
                form.setValue("isPurchasable", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <Label htmlFor="isPurchasable" className="text-muted-foreground">
              Disponible para compra
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="isRentable"
              checked={form.watch("isRentable")}
              onCheckedChange={(v) =>
                form.setValue("isRentable", v, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <Label htmlFor="isRentable" className="text-muted-foreground">
              Disponible para alquiler
            </Label>
          </div>
          {form.watch("isRentable") && (
            <>
              <TextInput
                label="Precio de alquiler (Bs.)"
                name="rentalPrice"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
              />
              <SelectInput
                formControl={form.control}
                label="Stock de alquiler"
                name="rentalStockMode"
                options={[
                  { value: "shared", label: "Compartido con ventas" },
                  { value: "separate", label: "Stock separado" },
                ]}
              />
              {form.watch("rentalStockMode") === "separate" &&
                !form.watch("hasVariants") && (
                  <TextInput
                    label="Stock de alquiler"
                    name="rentalStock"
                    type="number"
                    min={0}
                    step={1}
                  />
                )}
            </>
          )}
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

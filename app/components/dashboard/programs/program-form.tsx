"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import ProgramImageUpload from "@/app/components/dashboard/programs/program-image-upload";
import VenueQuickCreateDialog from "@/app/components/dashboard/programs/venue-quick-create-dialog";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createProgram, updateProgram } from "@/app/lib/programs/admin-actions";
import type { Program, Venue } from "@/app/lib/programs/definitions";
import {
  dateOrNull,
  idOrNull,
  numberOrNull,
  programFormSchema,
  textOrNull,
  toDateTimeLocal,
  type ProgramFormValues,
} from "@/app/lib/programs/form-schemas";
import { PARTICIPANT_DISCOUNT_TYPE_LABELS } from "@/app/lib/programs/pricing";

type Props = {
  program?: Program;
  venues: Venue[];
  festivals: { id: number; name: string }[];
};

const NONE = "none";

type VenueOption = Pick<Venue, "id" | "name">;

export default function ProgramForm({ program, venues, festivals }: Props) {
  const router = useRouter();
  const isEditing = Boolean(program);

  // Local so a venue created from the dialog is selectable immediately, without
  // a round trip that would discard everything else typed into the form.
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>(venues);
  const [uploadingArtwork, setUploadingArtwork] = useState<
    Record<"bannerUrl" | "thumbnailUrl", boolean>
  >({
    bannerUrl: false,
    thumbnailUrl: false,
  });

  const form = useForm<ProgramFormValues>({
    resolver: zodResolver(programFormSchema),
    defaultValues: {
      name: program?.name ?? "",
      summary: program?.summary ?? "",
      description: program?.description ?? "",
      bannerUrl: program?.bannerUrl ?? "",
      thumbnailUrl: program?.thumbnailUrl ?? "",
      startDate: toDateTimeLocal(program?.startDate).slice(0, 10),
      endDate: toDateTimeLocal(program?.endDate).slice(0, 10),
      festivalId: program?.festivalId ? String(program.festivalId) : NONE,
      defaultVenueId: program?.defaultVenueId
        ? String(program.defaultVenueId)
        : NONE,
      participantDiscountType: program?.participantDiscountType ?? NONE,
      participantDiscountValue:
        program?.participantDiscountValue != null
          ? String(program.participantDiscountValue)
          : "",
    },
  });

  const discountType = useWatch({
    control: form.control,
    name: "participantDiscountType",
  });
  const usesDiscountOverride = discountType !== NONE && Boolean(discountType);
  const isUploadingArtwork = Object.values(uploadingArtwork).some(Boolean);

  function setArtworkUploading(
    field: "bannerUrl" | "thumbnailUrl",
    isUploading: boolean,
  ) {
    setUploadingArtwork((current) => ({
      ...current,
      [field]: isUploading,
    }));
  }

  const action = form.handleSubmit(async (values) => {
    const overridesDiscount =
      values.participantDiscountType !== NONE &&
      Boolean(values.participantDiscountType);

    const payload = {
      name: values.name,
      summary: textOrNull(values.summary),
      description: textOrNull(values.description),
      bannerUrl: textOrNull(values.bannerUrl),
      thumbnailUrl: textOrNull(values.thumbnailUrl),
      startDate: dateOrNull(values.startDate),
      endDate: dateOrNull(values.endDate),
      festivalId:
        values.festivalId === NONE ? null : idOrNull(values.festivalId),
      defaultVenueId:
        values.defaultVenueId === NONE ? null : idOrNull(values.defaultVenueId),
      // The pair moves together: choosing "inherit" clears both columns.
      participantDiscountType: overridesDiscount
        ? (values.participantDiscountType as "percent" | "fixed")
        : null,
      participantDiscountValue: overridesDiscount
        ? (numberOrNull(values.participantDiscountValue) ?? 0)
        : null,
    };

    try {
      const result = program
        ? await updateProgram(program.id, payload)
        : await createProgram(payload);

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);

      if ("programId" in result) {
        router.push(`/dashboard/programs/${result.programId}`);
      }
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el programa");
    }
  });

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={action}>
        <TextInput label="Nombre" name="name" required />
        <TextareaInput
          formControl={form.control}
          label="Resumen"
          name="summary"
          placeholder="Una o dos líneas para la tarjeta y el compartido"
        />
        <TextareaInput
          formControl={form.control}
          label="Descripción"
          name="description"
          placeholder="De qué trata el programa"
        />

        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="Fecha de inicio" name="startDate" type="date" />
          <TextInput label="Fecha de fin" name="endDate" type="date" />
        </div>

        <SelectInput
          formControl={form.control}
          label="Festival asociado"
          name="festivalId"
          placeholder="Sin festival"
          options={[
            { value: NONE, label: "Sin festival" },
            ...festivals.map((festival) => ({
              value: String(festival.id),
              label: festival.name,
            })),
          ]}
        />

        <div className="grid gap-2">
          <SelectInput
            formControl={form.control}
            label="Lugar por defecto"
            name="defaultVenueId"
            placeholder="Sin lugar"
            options={[
              { value: NONE, label: "Sin lugar" },
              ...venueOptions.map((venue) => ({
                value: String(venue.id),
                label: venue.name,
              })),
            ]}
          />
          <div>
            <VenueQuickCreateDialog
              onCreated={(venue) => {
                setVenueOptions((current) => [...current, venue]);
                form.setValue("defaultVenueId", String(venue.id), {
                  shouldDirty: true,
                });
              }}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            formControl={form.control}
            label="Descuento para participantes"
            name="participantDiscountType"
            placeholder="Usar el descuento global"
            options={[
              { value: NONE, label: "Usar el descuento global" },
              ...(["percent", "fixed"] as const).map((value) => ({
                value,
                label: PARTICIPANT_DISCOUNT_TYPE_LABELS[value],
              })),
            ]}
          />
          {usesDiscountOverride ? (
            <TextInput
              label={
                discountType === "fixed"
                  ? "Monto de descuento (Bs)"
                  : "Porcentaje de descuento (%)"
              }
              name="participantDiscountValue"
              type="number"
              min="0"
              max={discountType === "percent" ? "100" : undefined}
              step="0.01"
              description={
                discountType === "fixed"
                  ? "Se resta del precio público; nunca baja de 0."
                  : "Se aplica sobre el precio público."
              }
              required
            />
          ) : null}
        </div>

        <section className="grid gap-3">
          <div>
            <h2 className="text-sm font-semibold">Imágenes del programa</h2>
            <p className="text-xs text-muted-foreground">
              Selecciona los archivos que verán las personas en la portada y los
              listados.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ProgramImageUpload
              control={form.control}
              name="bannerUrl"
              label="Imagen de portada"
              description="Recomendado: 1600 × 1200 px (4:3)."
              previewClassName="aspect-4/3"
              previewSizes="(min-width: 768px) 40vw, 90vw"
              onUploading={(isUploading) =>
                setArtworkUploading("bannerUrl", isUploading)
              }
            />
            <ProgramImageUpload
              control={form.control}
              name="thumbnailUrl"
              label="Miniatura"
              description="Recomendado: 1200 × 1200 px (1:1)."
              previewClassName="aspect-square"
              previewSizes="(min-width: 768px) 40vw, 90vw"
              onUploading={(isUploading) =>
                setArtworkUploading("thumbnailUrl", isUploading)
              }
            />
          </div>
        </section>

        <SubmitButton
          disabled={form.formState.isSubmitting || isUploadingArtwork}
          label={isEditing ? "Guardar cambios" : "Crear programa"}
        />
      </form>
    </Form>
  );
}

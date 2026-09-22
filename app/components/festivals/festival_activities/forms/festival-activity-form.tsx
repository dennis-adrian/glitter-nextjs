"use client";

import { useRouter } from "next/navigation";
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useState } from "react";
import {
  CalendarIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";

import {
  createFestivalActivity,
  updateFestivalActivity,
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
import ActivityDateTimeInput from "./activity-date-time-input";
import {
  ActivityFormSchema as FormSchema,
  type ActivityFormValues as FormValues,
  toDatetimeLocal,
  parseActivityDate,
} from "./activity-form-schema";
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
  { value: "sticker_hunt", label: "Cacería de Stickers" },
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

const WAITLIST_WINDOW_PRESETS = [
  { label: "30 minutos", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "2 horas", value: 120 },
  { label: "6 horas", value: 360 },
  { label: "24 horas", value: 1440 },
  { label: "Personalizado", value: -1 },
];

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
          imageUrl: "",
          couponBookHeaderImageUrl: "",
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
    waitlistEnabled:
      activity.waitlistWindowMinutes !== null &&
      activity.waitlistWindowMinutes !== undefined,
    waitlistWindowMinutes: activity.waitlistWindowMinutes ?? undefined,
    details: activity.details.map((d) => ({
      id: d.id,
      description: d.description ?? "",
      participationLimit: d.participationLimit ?? undefined,
      category: d.category && d.category !== "none" ? d.category : null,
      imageUrl: d.imageUrl ?? "",
      couponBookHeaderImageUrl: d.couponBookHeaderImageUrl ?? "",
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(
    new Set(),
  );
  const trackUpload = (key: string, uploading: boolean) =>
    setUploadingImages((current) => {
      const next = new Set(current);
      if (uploading) next.add(key);
      else next.delete(key);
      return next;
    });
  const backHref = `/dashboard/festivals/${festivalId}/festival_activities`;

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: buildDefaultValues(activity),
  });

  const {
    fields: detailFields,
    append: appendDetail,
    remove: removeDetail,
  } = useFieldArray({ control: form.control, name: "details" });

  const [proofType, activityType, allowsVoting, waitlistEnabled] = useWatch({
    control: form.control,
    name: ["proofType", "type", "allowsVoting", "waitlistEnabled"],
  });
  const formErrors = form.formState.errors;

  const onSubmit = form.handleSubmit(
    async (data) => {
      setSaveError(null);
      if (uploadingImages.size) {
        setSaveError("Esperá a que terminen de subir las imágenes.");
        return;
      }
      const toDate = (str: string | undefined) =>
        str ? parseActivityDate(str) : undefined;

      const details = data.details.map((detail) => ({
        ...detail,
        category: detail.category ?? null,
        imageUrl: detail.imageUrl || undefined,
        couponBookHeaderImageUrl: detail.couponBookHeaderImageUrl || undefined,
      }));

      const payload = {
        name: data.name,
        description: data.description,
        visitorsDescription: data.visitorsDescription,
        type: data.type,
        accessLevel: data.accessLevel,
        promotionalArtUrl: data.promotionalArtUrl,
        activityPrizeUrl: data.activityPrizeUrl,
        registrationStartDate: parseActivityDate(data.registrationStartDate),
        registrationEndDate: parseActivityDate(data.registrationEndDate),
        proofType: data.proofType ?? null,
        proofUploadLimitDate: data.proofType
          ? toDate(data.proofUploadLimitDate)
          : undefined,
        allowsVoting: data.allowsVoting,
        votingStartDate: data.allowsVoting
          ? toDate(data.votingStartDate)
          : undefined,
        votingEndDate: data.allowsVoting
          ? toDate(data.votingEndDate)
          : undefined,
        waitlistWindowMinutes: data.waitlistEnabled
          ? (data.waitlistWindowMinutes ?? null)
          : null,
        details,
      };

      try {
        const result = isEditing
          ? await updateFestivalActivity(activity.id, festivalId, payload)
          : await createFestivalActivity(festivalId, payload);

        if (result.success) {
          toast.success(result.message);
          router.push(`/dashboard/festivals/${festivalId}/festival_activities`);
        } else {
          setSaveError(result.message);
          toast.error(result.message);
        }
      } catch {
        setSaveError(
          "No se pudo guardar la actividad. Tus cambios siguen aquí; intentá nuevamente.",
        );
      }
    },
    () => {
      setSaveError(null);
      toast.error("Revisá los campos marcados antes de guardar.");
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <nav
          aria-label="Secciones del formulario"
          className="flex flex-wrap gap-2 text-sm"
        >
          {[
            ["actividad", "Actividad"],
            ["inscripciones", "Inscripciones"],
            ["cupos", "Cupos"],
            ["requisitos", "Material y votación"],
            ["imagenes", "Imágenes"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border bg-card px-3 py-1.5 text-muted-foreground hover:text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </a>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          Los campos con * son obligatorios. Las imágenes y descripciones son
          opcionales.
        </p>
        <fieldset
          disabled={form.formState.isSubmitting}
          className="min-w-0 space-y-5"
        >
          {/* Basic Info */}
          <Card id="actividad" className="scroll-mt-24">
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold text-lg">Sobre la actividad</h2>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Nombre de la actividad <span aria-hidden="true">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        required
                        placeholder="Ej.: Cuponera de Descuentos"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectInput
                  formControl={form.control}
                  name="type"
                  label="Tipo de actividad"
                  options={ACTIVITY_TYPE_OPTIONS}
                />

                <SelectInput
                  formControl={form.control}
                  name="accessLevel"
                  label="Nivel de acceso"
                  options={ACCESS_LEVEL_OPTIONS}
                />
              </div>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Resumen para participantes (opcional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          className="resize-y min-h-32"
                          rows={5}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Se muestra en la tarjeta del portal de participantes.
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
                      <FormLabel>
                        Descripción para visitantes (opcional)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          className="resize-y min-h-32"
                          rows={5}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Explicá cómo funciona la actividad en su página pública.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Registration Dates */}
          <Card id="inscripciones" className="scroll-mt-24">
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                Inscripciones
              </h2>
              <p className="text-sm text-muted-foreground">
                Definí cuándo se puede participar. Todos los horarios son de
                Bolivia (UTC−4).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="registrationStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Apertura de inscripciones{" "}
                        <span aria-hidden="true">*</span>
                      </FormLabel>
                      <FormControl>
                        <ActivityDateTimeInput
                          {...field}
                          value={field.value ?? ""}
                          label="Apertura de inscripciones"
                        />
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
                      <FormLabel>
                        Cierre de inscripciones{" "}
                        <span aria-hidden="true">*</span>
                      </FormLabel>
                      <FormControl>
                        <ActivityDateTimeInput
                          {...field}
                          value={field.value ?? ""}
                          label="Cierre de inscripciones"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Activity Details / Variants */}
          <Card id="cupos" className="scroll-mt-24">
            <CardContent className="p-5 space-y-5">
              <h2 className="font-semibold text-lg">Cupos y categorías</h2>
              <p className="text-sm text-muted-foreground">
                Usá una variante para todos o separá los cupos por categoría.
              </p>

              {detailFields.map((field, index) => (
                <VariantSection
                  key={field.id}
                  form={form}
                  index={index}
                  showCouponBookHeaderImage={activityType === "coupon_book"}
                  onRemove={() => removeDetail(index)}
                  canRemove={detailFields.length > 1}
                  isUploading={uploadingImages.size > 0}
                  participantCount={
                    activity?.details
                      .find(
                        (detail) =>
                          detail.id === form.getValues(`details.${index}.id`),
                      )
                      ?.participants.filter(
                        (participant) => participant.removedAt === null,
                      ).length ?? 0
                  }
                  onUploading={(key, uploading) =>
                    trackUpload(`${field.id}-${key}`, uploading)
                  }
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
                    imageUrl: "",
                    couponBookHeaderImageUrl: "",
                  })
                }
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                Agregar variante
              </Button>
              <div className="border-t pt-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Lista de espera</h3>
                    <p className="text-sm text-muted-foreground">
                      Avisá al siguiente participante cuando se libere un cupo.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="waitlistEnabled"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            aria-label="Habilitar lista de espera"
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
                        <FormLabel>Duración de la invitación</FormLabel>
                        <FormDescription>
                          Tiempo para aceptar un cupo desde que se envía la
                          invitación.
                        </FormDescription>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {WAITLIST_WINDOW_PRESETS.filter(
                            (p) => p.value > 0,
                          ).map((preset) => (
                            <Button
                              key={preset.value}
                              type="button"
                              size="sm"
                              variant={
                                field.value === preset.value
                                  ? "default"
                                  : "outline"
                              }
                              aria-pressed={field.value === preset.value}
                              onClick={() => field.onChange(preset.value)}
                            >
                              {preset.label}
                            </Button>
                          ))}
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
              </div>
            </CardContent>
          </Card>

          {/* Proof */}
          <Card id="requisitos" className="scroll-mt-24">
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold text-lg">Material y votación</h2>
              <p className="text-sm text-muted-foreground">
                Pedí material para revisar la participación o habilitá una
                votación.
              </p>
              <FormField
                control={form.control}
                name="proofType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de material</FormLabel>
                    {/* text-base at every width: iOS Safari zooms the page in, and
                      does not zoom back out, when it focuses a control with
                      text under 16px. A phone in landscape is already past
                      `sm`, so the breakpoint is no guard. */}
                    <FormControl>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? null : e.target.value,
                          )
                        }
                      >
                        <option value="">Sin material</option>
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
                      <FormLabel>
                        Fecha límite de envío <span aria-hidden="true">*</span>
                      </FormLabel>
                      <FormControl>
                        <ActivityDateTimeInput
                          {...field}
                          value={field.value ?? ""}
                          label="Fecha límite de envío"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="border-t pt-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Votación</h3>
                    <p className="text-sm text-muted-foreground">
                      Permití que los participantes voten durante el período
                      elegido.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="allowsVoting"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch
                            aria-label="Habilitar votación"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                {allowsVoting && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="votingStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Inicio de votación <span aria-hidden="true">*</span>
                          </FormLabel>
                          <FormControl>
                            <ActivityDateTimeInput
                              {...field}
                              value={field.value ?? ""}
                              label="Inicio de votación"
                            />
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
                          <FormLabel>
                            Fin de votación <span aria-hidden="true">*</span>
                          </FormLabel>
                          <FormControl>
                            <ActivityDateTimeInput
                              {...field}
                              value={field.value ?? ""}
                              label="Fin de votación"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card id="imagenes" className="scroll-mt-24">
            <details
              className="group"
              open={Boolean(
                activity?.promotionalArtUrl || activity?.activityPrizeUrl,
              )}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="font-display font-semibold text-lg">
                    Imágenes de la actividad
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Opcional. Arte promocional e imagen del premio.
                  </span>
                </span>
                <ChevronDownIcon
                  className="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <CardContent className="space-y-4 px-5 pb-5">
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
                          compact
                          onUploading={(uploading) =>
                            trackUpload("promotional-art", uploading)
                          }
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
                          compact
                          onUploading={(uploading) =>
                            trackUpload("prize", uploading)
                          }
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </details>
          </Card>
        </fieldset>
        <div className="sticky bottom-0 z-20 border-t bg-background/95 px-1 py-3 backdrop-blur-sm space-y-2">
          {/* Validation error summary */}
          {Object.keys(formErrors).length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              Hay errores en el formulario. Revisá los campos marcados en rojo.
            </p>
          )}

          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" role="status">
              {uploadingImages.size
                ? "Subiendo imágenes…"
                : form.formState.isDirty
                  ? "Tenés cambios sin guardar"
                  : isEditing
                    ? "Editá los campos que necesitás cambiar"
                    : "La actividad se publicará al crearla"}
            </p>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push(backHref)}
                disabled={
                  form.formState.isSubmitting || uploadingImages.size > 0
                }
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  form.formState.isSubmitting || uploadingImages.size > 0
                }
              >
                {form.formState.isSubmitting
                  ? isEditing
                    ? "Guardando..."
                    : "Creando..."
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear actividad"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}

type VariantSectionProps = {
  form: UseFormReturn<FormValues>;
  index: number;
  showCouponBookHeaderImage: boolean;
  onRemove: () => void;
  canRemove: boolean;
  isUploading: boolean;
  participantCount: number;
  onUploading: (key: string, uploading: boolean) => void;
};

function VariantSection({
  form,
  index,
  showCouponBookHeaderImage,
  onRemove,
  canRemove,
  isUploading,
  participantCount,
  onUploading,
}: VariantSectionProps) {
  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-medium text-sm">Variante {index + 1}</h3>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Eliminar variante ${index + 1}`}
            disabled={participantCount > 0 || isUploading}
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        )}
      </div>

      {participantCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {participantCount} participante(s) inscrito(s). Esta variante no se
          puede eliminar.
        </p>
      )}
      <FormField
        control={form.control}
        name={`details.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nombre de la variante (opcional)</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`details.${index}.participationLimit`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cupos disponibles (opcional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
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
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría</FormLabel>
              <FormControl>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === "" ? null : e.target.value,
                    )
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
              <FormDescription>
                Elegí quiénes pueden inscribirse en esta variante.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <details
        className="group"
        open={Boolean(
          form.getValues(`details.${index}.imageUrl`) ||
          form.getValues(`details.${index}.couponBookHeaderImageUrl`),
        )}
      >
        <summary className="flex items-center gap-2 text-sm font-medium text-primary cursor-pointer list-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronDownIcon
            className="size-4 group-open:rotate-180"
            aria-hidden="true"
          />
          Imágenes de esta variante (opcional)
        </summary>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name={`details.${index}.imageUrl`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Imagen de la variante (opcional)</FormLabel>
                <FormControl>
                  <SectorImageUpload
                    imageUrl={field.value || null}
                    setImageUrl={(url) => field.onChange(url)}
                    sectorName={`variante-${index + 1}`}
                    compact
                    onUploading={(uploading) => onUploading("image", uploading)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {showCouponBookHeaderImage && (
            <FormField
              control={form.control}
              name={`details.${index}.couponBookHeaderImageUrl`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cabecera de la cuponera (opcional)</FormLabel>
                  <FormControl>
                    <SectorImageUpload
                      imageUrl={field.value || null}
                      setImageUrl={(url) => field.onChange(url)}
                      sectorName={`couponbook-header-${index + 1}`}
                      compact
                      onUploading={(uploading) =>
                        onUploading("header", uploading)
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Encabezado de la cuponera impresa para esta variante.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </details>
    </div>
  );
}

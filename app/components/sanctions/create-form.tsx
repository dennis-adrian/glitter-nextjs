"use client";

import ComboboxInput from "@/app/components/form/fields/combobox";
import TextareaInput from "@/app/components/form/fields/textarea";
import SanctionInfractionOption from "@/app/components/sanctions/infraction-option";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  createAndApproveSanction,
  searchEligibleInfractionsForSanction,
} from "@/app/lib/sanctions/actions";
import { calculateSanctionEndsAt } from "@/app/lib/sanctions/lifecycle";
import {
  formatSanctionValidity,
  sanctionStatusLabel,
  sanctionFestivalScopeLabel,
  sanctionTypeLabel,
  validityUnitLabel,
} from "@/app/lib/sanctions/mappers";
import type { EligibleInfractionOption } from "@/app/lib/sanctions/queries";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  durationUnitEnum,
  sanctionFestivalScopeEnum,
  sanctionTypeEnum,
} from "@/db/schema";
import { DateTime } from "luxon";
import { useMemo, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";

const FormSchema = z
  .object({
    type: z.enum(sanctionTypeEnum.enumValues),
    festivalScope: z.enum(sanctionFestivalScopeEnum.enumValues),
    validityUnit: z.enum(durationUnitEnum.enumValues),
    validityDuration: z.string().optional(),
    startsAt: z.string().min(1, "Indicá el inicio"),
    reservationDelayMinutes: z.string().optional(),
    description: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.validityUnit !== "indefinitely" &&
      (!Number.isInteger(Number(data.validityDuration)) ||
        Number(data.validityDuration) <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validityDuration"],
        message: "Indicá una duración positiva",
      });
    }
    if (
      data.type === "reservation_delay" &&
      (!Number.isInteger(Number(data.reservationDelayMinutes)) ||
        Number(data.reservationDelayMinutes) <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reservationDelayMinutes"],
        message: "Indicá un retraso positivo en minutos",
      });
    }
  });

type CreateSanctionFormProps = {
  userId: number;
  participantLabel: string;
  initialInfractions: EligibleInfractionOption[];
  onSuccess: (sanctionId: number) => void;
};

export default function CreateSanctionForm({
  userId,
  participantLabel,
  initialInfractions,
  onSuccess,
}: CreateSanctionFormProps) {
  const [selected, setSelected] =
    useState<EligibleInfractionOption[]>(initialInfractions);
  const [candidates, setCandidates] = useState<EligibleInfractionOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, startSearch] = useTransition();
  const [reviewValues, setReviewValues] = useState<z.infer<
    typeof FormSchema
  > | null>(null);
  const [formOpenedAt] = useState(() => Date.now());
  const latestSearchId = useRef(0);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      type: "warning" as const,
      festivalScope: "global" as const,
      validityUnit: "indefinitely" as const,
      validityDuration: "",
      startsAt: DateTime.now()
        .setZone(STORE_TIMEZONE)
        .toFormat("yyyy-MM-dd'T'HH:mm"),
      reservationDelayMinutes: "",
      description: "",
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const validityUnit = useWatch({
    control: form.control,
    name: "validityUnit",
  });

  const selectedIds = useMemo(
    () => selected.map((item) => item.id),
    [selected],
  );

  const searchInfractions = useDebouncedCallback(
    (
      query: string,
      excludeInfractionIds: number[],
      requestedSearchId: number,
    ) => {
      startSearch(async () => {
        const results = await searchEligibleInfractionsForSanction({
          userId,
          query,
          excludeInfractionIds,
          limit: 15,
        });
        if (requestedSearchId === latestSearchId.current) {
          setCandidates(results);
        }
      });
    },
    300,
  );

  const runSearch = (query: string) => {
    setSearchQuery(query);
    const requestedSearchId = ++latestSearchId.current;
    searchInfractions(query, selectedIds, requestedSearchId);
  };

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    if (selected.length === 0) {
      toast.error("Seleccioná al menos una infracción");
      return;
    }

    const startsAt = DateTime.fromISO(values.startsAt, {
      zone: STORE_TIMEZONE,
    });
    if (!startsAt.isValid) {
      toast.error("Fecha de inicio inválida");
      setReviewValues(null);
      return;
    }

    const validityDuration =
      values.validityUnit === "indefinitely"
        ? null
        : Number(values.validityDuration);

    const reservationDelayMinutes =
      values.type === "reservation_delay"
        ? Number(values.reservationDelayMinutes)
        : null;
    const endsAt = calculateSanctionEndsAt(
      startsAt.toJSDate(),
      validityDuration,
      values.validityUnit,
    );
    if (endsAt && endsAt.getTime() <= formOpenedAt) {
      toast.error(
        "La validez de la sanción debe finalizar después del momento de aprobación",
      );
      setReviewValues(null);
      return;
    }

    if (!reviewValues) {
      setReviewValues(values);
      return;
    }

    const response = await createAndApproveSanction({
      userId,
      infractionIds: selectedIds,
      type: values.type,
      festivalScope: values.festivalScope,
      validityUnit: values.validityUnit,
      validityDuration,
      startsAt: startsAt.toJSDate(),
      reservationDelayMinutes,
      description: values.description,
    });

    if (!response.success) {
      toast.error(response.message);
      setReviewValues(null);
      return;
    }

    toast.success(response.message);
    onSuccess(response.sanctionId);
  };

  const reviewStartsAt = reviewValues
    ? DateTime.fromISO(reviewValues.startsAt, { zone: STORE_TIMEZONE })
    : null;
  const reviewDuration = reviewValues?.validityDuration
    ? Number(reviewValues.validityDuration)
    : null;
  const reviewEndsAtDate =
    reviewStartsAt?.isValid && reviewValues
      ? calculateSanctionEndsAt(
          reviewStartsAt.toJSDate(),
          reviewDuration,
          reviewValues.validityUnit,
        )
      : null;
  const reviewEndsAt = reviewEndsAtDate
    ? DateTime.fromJSDate(reviewEndsAtDate).setZone(STORE_TIMEZONE)
    : null;
  const reviewStatus =
    reviewStartsAt?.isValid && reviewStartsAt.toMillis() > formOpenedAt
      ? "scheduled"
      : "active";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className={reviewValues ? "hidden" : "contents"}>
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Participante: </span>
              {participantLabel}
            </p>
            <p className="text-muted-foreground">
              Al confirmar, la sanción se crea y aprueba en el mismo flujo.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Infracciones incluidas</p>
            <ul className="space-y-2">
              {selected.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <SanctionInfractionOption infraction={item} />
                  {selected.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      Quitar
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-2 rounded-md border p-2">
              <Input
                placeholder="Buscar más infracciones del participante"
                value={searchQuery}
                onChange={(event) => runSearch(event.target.value)}
              />
              {isSearching && (
                <p className="text-xs text-muted-foreground">Buscando…</p>
              )}
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {candidates.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setSelected((current) => [...current, item]);
                              setCandidates((current) =>
                                current.filter((entry) => entry.id !== item.id),
                              );
                            } else {
                              setSelected((current) =>
                                current.filter((entry) => entry.id !== item.id),
                              );
                            }
                          }}
                        />
                        <SanctionInfractionOption infraction={item} />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <ComboboxInput
            form={form}
            name="type"
            label="Tipo de sanción"
            options={sanctionTypeEnum.enumValues.map((value) => ({
              value,
              label: sanctionTypeLabel[value],
            }))}
          />
          <ComboboxInput
            form={form}
            name="festivalScope"
            label="Alcance"
            options={sanctionFestivalScopeEnum.enumValues.map((value) => ({
              value,
              label: sanctionFestivalScopeLabel[value],
            }))}
          />
          <ComboboxInput
            form={form}
            name="validityUnit"
            label="Unidad de validez"
            options={durationUnitEnum.enumValues.map((value) => ({
              value,
              label: validityUnitLabel[value],
            }))}
          />

          {validityUnit !== "indefinitely" && (
            <FormField
              control={form.control}
              name="validityDuration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración de validez</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="startsAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Inicio</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {type === "reservation_delay" && (
            <FormField
              control={form.control}
              name="reservationDelayMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retraso de reserva (minutos)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <TextareaInput
            formControl={form.control}
            name="description"
            label="Descripción / consecuencias"
            placeholder="Motivo y consecuencias visibles para el participante"
            maxLength={2000}
          />
        </div>

        {reviewValues && reviewStartsAt?.isValid && (
          <section className="space-y-4 rounded-md border p-4 text-sm">
            <div>
              <h2 className="font-medium text-base">Revisión final</h2>
              <p className="text-muted-foreground">
                Confirmá la información antes de crear y aprobar la sanción.
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Participante</dt>
                <dd className="font-medium">{participantLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado inicial</dt>
                <dd>{sanctionStatusLabel[reviewStatus]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{sanctionTypeLabel[reviewValues.type]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Alcance</dt>
                <dd>
                  {sanctionFestivalScopeLabel[reviewValues.festivalScope]}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inicio</dt>
                <dd>{reviewStartsAt.toLocaleString(DateTime.DATETIME_MED)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Validez</dt>
                <dd>
                  {formatSanctionValidity({
                    validityDuration: reviewDuration,
                    validityUnit: reviewValues.validityUnit,
                  })}
                  {reviewEndsAt?.isValid
                    ? ` · hasta ${reviewEndsAt.toLocaleString(DateTime.DATETIME_MED)}`
                    : ""}
                </dd>
              </div>
              {reviewValues.type === "reservation_delay" && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Acceso a reservas</dt>
                  <dd>
                    {reviewValues.reservationDelayMinutes} minutos después del
                    inicio de reservas de cada festival aplicable
                  </dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">
                  Descripción y consecuencia
                </dt>
                <dd className="whitespace-pre-wrap">
                  {reviewValues.description?.trim() || "Sin descripción"}
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <h3 className="font-medium">Infracciones incluidas</h3>
              <ul className="space-y-2">
                {selected.map((item) => (
                  <li key={item.id} className="rounded-md border p-2">
                    <SanctionInfractionOption infraction={item} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {reviewValues && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewValues(null)}
              disabled={form.formState.isSubmitting}
            >
              Volver a editar
            </Button>
          )}
          <SubmitButton
            disabled={form.formState.isSubmitting || selected.length === 0}
            loading={form.formState.isSubmitting}
          >
            {reviewValues ? "Crear y aprobar sanción" : "Revisar sanción"}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}

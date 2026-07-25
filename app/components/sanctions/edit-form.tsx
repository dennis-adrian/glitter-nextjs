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
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  editSanction,
  searchEligibleInfractionsForSanction,
} from "@/app/lib/sanctions/actions";
import { canEditSanction } from "@/app/lib/sanctions/lifecycle";
import {
  sanctionFestivalScopeLabel,
  validityUnitLabel,
} from "@/app/lib/sanctions/mappers";
import type {
  EligibleInfractionOption,
  SanctionDetail,
} from "@/app/lib/sanctions/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { durationUnitEnum, sanctionFestivalScopeEnum } from "@/db/schema";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";

const FormSchema = z.object({
  festivalScope: z.enum(sanctionFestivalScopeEnum.enumValues),
  validityUnit: z.enum(durationUnitEnum.enumValues),
  validityDuration: z.string().optional(),
  startsAt: z.string().min(1),
  reservationDelayMinutes: z.string().optional(),
  description: z.string().max(2000).nullable(),
  reason: z.string().trim().min(1, "Indicá el motivo del cambio").max(1000),
});

export default function EditSanctionForm({
  sanction,
}: {
  sanction: SanctionDetail;
}) {
  const router = useRouter();
  const linked = sanction.sanctionInfractions.map((link) => link.infraction);
  const [keepIds, setKeepIds] = useState(
    () => new Set(linked.map((i) => i.id)),
  );
  const [toAdd, setToAdd] = useState<EligibleInfractionOption[]>([]);
  const [candidates, setCandidates] = useState<EligibleInfractionOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, startSearch] = useTransition();
  const latestSearchId = useRef(0);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      festivalScope: sanction.festivalScope,
      validityUnit: sanction.validityUnit,
      validityDuration:
        sanction.validityDuration != null
          ? String(sanction.validityDuration)
          : "",
      startsAt: DateTime.fromJSDate(sanction.startsAt)
        .setZone(STORE_TIMEZONE)
        .toFormat("yyyy-MM-dd'T'HH:mm"),
      reservationDelayMinutes:
        sanction.reservationDelayMinutes != null
          ? String(sanction.reservationDelayMinutes)
          : "",
      description: sanction.description ?? "",
      reason: "",
    },
  });

  const validityUnit = useWatch({
    control: form.control,
    name: "validityUnit",
  });

  const excludeIds = useMemo(
    () => [...keepIds, ...toAdd.map((item) => item.id)],
    [keepIds, toAdd],
  );

  const searchInfractions = useDebouncedCallback(
    (
      query: string,
      excludeInfractionIds: number[],
      requestedSearchId: number,
    ) => {
      startSearch(async () => {
        const results = await searchEligibleInfractionsForSanction({
          userId: sanction.userId,
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

  if (!canEditSanction(sanction.status)) {
    return null;
  }

  const runSearch = (query: string) => {
    setSearchQuery(query);
    const requestedSearchId = ++latestSearchId.current;
    searchInfractions(query, excludeIds, requestedSearchId);
  };

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    const startsAt = DateTime.fromISO(values.startsAt, {
      zone: STORE_TIMEZONE,
    });
    if (!startsAt.isValid) {
      toast.error("Fecha de inicio inválida");
      return;
    }

    const removeInfractionIds = linked
      .map((item) => item.id)
      .filter((id) => !keepIds.has(id));

    const response = await editSanction({
      sanctionId: sanction.id,
      festivalScope: values.festivalScope,
      validityUnit: values.validityUnit,
      validityDuration:
        values.validityUnit === "indefinitely"
          ? null
          : Number(values.validityDuration),
      startsAt: startsAt.toJSDate(),
      reservationDelayMinutes:
        sanction.type === "reservation_delay"
          ? Number(values.reservationDelayMinutes)
          : null,
      description: values.description?.trim()
        ? values.description.trim()
        : null,
      addInfractionIds: toAdd.map((item) => item.id),
      removeInfractionIds,
      reason: values.reason,
    });

    if (!response.success) {
      toast.error(response.message);
      return;
    }

    toast.success(response.message);
    const finalIds = new Set([
      ...linked.map((item) => item.id).filter((id) => keepIds.has(id)),
      ...toAdd.map((item) => item.id),
    ]);
    setKeepIds(finalIds);
    form.reset({ ...values, reason: "" });
    setToAdd([]);
    router.refresh();
  };

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-medium">Editar sanción</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Infracciones vinculadas</p>
            <ul className="space-y-2">
              {linked.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={keepIds.has(item.id)}
                      onCheckedChange={(value) => {
                        setKeepIds((current) => {
                          const next = new Set(current);
                          if (value) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                    />
                    <SanctionInfractionOption infraction={item} />
                  </label>
                </li>
              ))}
              {toAdd.map((item) => (
                <li
                  key={`add-${item.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 text-sm"
                >
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Se agregará
                    </span>
                    <SanctionInfractionOption infraction={item} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setToAdd((current) =>
                        current.filter((entry) => entry.id !== item.id),
                      )
                    }
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>

            <div className="space-y-2 rounded-md border p-2">
              <Input
                placeholder="Buscar infracciones elegibles"
                value={searchQuery}
                onChange={(event) => runSearch(event.target.value)}
              />
              {isSearching && (
                <p className="text-xs text-muted-foreground">Buscando…</p>
              )}
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {candidates.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full text-left rounded-md p-2 text-sm hover:bg-muted/50"
                      onClick={() => {
                        setToAdd((current) => [...current, item]);
                        setCandidates((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        );
                      }}
                    >
                      <SanctionInfractionOption infraction={item} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

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
                    <Input type="number" min={1} step={1} {...field} />
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

          {sanction.type === "reservation_delay" && (
            <FormField
              control={form.control}
              name="reservationDelayMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retraso de reserva (minutos)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <TextareaInput
            formControl={form.control}
            name="description"
            label="Descripción"
            placeholder="Motivo y consecuencias"
            maxLength={2000}
          />
          <TextareaInput
            formControl={form.control}
            name="reason"
            label="Motivo del cambio"
            placeholder="Por qué se edita esta sanción"
            maxLength={1000}
            required
          />

          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Guardar cambios
          </SubmitButton>
        </form>
      </Form>
    </section>
  );
}

"use client";

import ComboboxInput from "@/app/components/form/fields/combobox";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import SearchInput from "@/app/components/ui/search-input/input";
import type { SearchOption } from "@/app/components/ui/search-input/search-content";
import {
  registerInfraction,
  searchUsersForInfraction,
} from "@/app/lib/infractions/actions";
import type { DuplicateInfractionCandidate } from "@/app/lib/infractions/definitions";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { participantDisplayName } from "@/app/lib/infractions/mappers";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z
  .object({
    userId: z.number().int().positive("Seleccioná un participante"),
    infractionType: z.string().min(1, "El tipo de infracción es requerido"),
    festivalId: z.string().optional(),
    description: z.string().max(2000).optional(),
    userGaveNotice: z.boolean(),
    gaveNoticeAt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.userGaveNotice && !data.gaveNoticeAt) {
      ctx.addIssue({
        code: "custom",
        path: ["gaveNoticeAt"],
        message: "Indicá cuándo el participante dio aviso",
      });
    }
    if (data.gaveNoticeAt) {
      const parsed = DateTime.fromISO(data.gaveNoticeAt, {
        zone: STORE_TIMEZONE,
      });
      if (!parsed.isValid) {
        ctx.addIssue({
          code: "custom",
          path: ["gaveNoticeAt"],
          message: "Fecha de aviso inválida",
        });
      }
    }
  });

type FestivalOption = { id: number; name: string };

type GlobalRegisterInfractionFormProps = {
  infractionTypes: InfractionType[];
  festivals: FestivalOption[];
  defaultUserId?: number;
  defaultFestivalId?: number | null;
  onSuccess: (infractionId: number) => void;
};

export default function GlobalRegisterInfractionForm({
  infractionTypes,
  festivals,
  defaultUserId,
  defaultFestivalId,
  onSuccess,
}: GlobalRegisterInfractionFormProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [duplicateWarning, setDuplicateWarning] = useState<{
    contextKey: string;
    candidates: DuplicateInfractionCandidate[];
  } | null>(null);
  const [confirmedDuplicateKey, setConfirmedDuplicateKey] = useState<
    string | null
  >(null);
  const [userOptions, setUserOptions] = useState<SearchOption[]>([]);
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [isSearching, startSearch] = useTransition();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      userId: defaultUserId,
      description: "",
      userGaveNotice: false,
      gaveNoticeAt: "",
      festivalId:
        defaultFestivalId != null ? String(defaultFestivalId) : "none",
    },
  });

  const userGaveNotice = useWatch({
    control: form.control,
    name: "userGaveNotice",
  });
  const infractionType = useWatch({
    control: form.control,
    name: "infractionType",
  });
  const selectedUserId = useWatch({
    control: form.control,
    name: "userId",
  });
  const selectedFestivalId = useWatch({
    control: form.control,
    name: "festivalId",
  });

  const duplicateContextKey = `${selectedUserId ?? ""}:${infractionType ?? ""}:${selectedFestivalId ?? "none"}`;
  const duplicates =
    duplicateWarning?.contextKey === duplicateContextKey
      ? duplicateWarning.candidates
      : [];
  const confirmDuplicate = confirmedDuplicateKey === duplicateContextKey;

  const festivalOptions = [
    { value: "none", label: "Global (sin festival)" },
    ...festivals.map((festival) => ({
      value: String(festival.id),
      label: festival.name,
    })),
  ];

  const typeOptions = infractionTypes.map((type) => ({
    value: String(type.id),
    label: type.label,
  }));

  const handleUserSearch = (term: string) => {
    startSearch(async () => {
      const users = await searchUsersForInfraction(term);
      setUserOptions(
        users.map((user) => ({
          value: user.id,
          label: `${participantDisplayName(user)} · ${user.email}`,
        })),
      );
    });
  };

  const action = form.handleSubmit(async (data) => {
    const festivalId =
      !data.festivalId || data.festivalId === "none"
        ? null
        : Number(data.festivalId);

    const response = await registerInfraction({
      userId: data.userId,
      typeId: Number(data.infractionType),
      festivalId,
      description: data.description || undefined,
      userGaveNotice: data.userGaveNotice,
      gaveNoticeAt:
        data.userGaveNotice && data.gaveNoticeAt
          ? DateTime.fromISO(data.gaveNoticeAt, {
              zone: STORE_TIMEZONE,
            }).toJSDate()
          : null,
      idempotencyKey,
      confirmDuplicate,
    });

    if (response.success) {
      toast.success(response.message);
      setIdempotencyKey(crypto.randomUUID());
      setDuplicateWarning(null);
      setConfirmedDuplicateKey(null);
      onSuccess(response.infractionId);
      return;
    }

    if (response.code === "duplicate_warning" && response.duplicates) {
      setDuplicateWarning({
        contextKey: duplicateContextKey,
        candidates: response.duplicates,
      });
      toast.warning(response.message);
      return;
    }

    toast.error(response.message);
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={action}>
        <div className="space-y-2">
          <FormLabel>Participante</FormLabel>
          {selectedUserLabel ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{selectedUserLabel}</span>
              {!defaultUserId && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    form.setValue("userId", undefined as unknown as number, {
                      shouldDirty: true,
                    });
                    setSelectedUserLabel("");
                  }}
                >
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <SearchInput
              id="infraction-participant-search"
              placeholder="Buscar por nombre o correo"
              options={userOptions}
              isLoading={isSearching}
              onSearch={handleUserSearch}
              onSelect={(userId) => {
                const option = userOptions.find(
                  (item) => Number(item.value) === userId,
                );
                form.setValue("userId", userId, { shouldValidate: true });
                setSelectedUserLabel(option?.label ?? String(userId));
              }}
            />
          )}
          <FormMessage>
            {form.formState.errors.userId?.message as string | undefined}
          </FormMessage>
        </div>

        <ComboboxInput
          form={form}
          name="infractionType"
          options={typeOptions}
          label="Tipo de infracción"
          placeholder="Selecciona una opción"
        />
        <ComboboxInput
          form={form}
          name="festivalId"
          options={festivalOptions}
          label="Festival"
          placeholder="Global o festival"
        />
        <TextareaInput
          formControl={form.control}
          name="description"
          label="Detalles del incidente"
          placeholder="Descripción opcional"
          maxLength={2000}
        />
        <FormField
          control={form.control}
          name="userGaveNotice"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel>¿El participante dio aviso previo?</FormLabel>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    if (checked !== true) form.setValue("gaveNoticeAt", "");
                  }}
                />
                <FormDescription>
                  Avisó a la organización antes del incumplimiento o incidente
                </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {userGaveNotice && (
          <FormField
            control={form.control}
            name="gaveNoticeAt"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>Fecha y hora del aviso</FormLabel>
                <Input
                  type="datetime-local"
                  {...field}
                  value={field.value ?? ""}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {duplicates.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
            <p className="font-medium text-amber-900">
              Posibles infracciones duplicadas (últimas 24 h)
            </p>
            <ul className="list-disc pl-4 space-y-1 text-amber-900">
              {duplicates.map((duplicate) => (
                <li key={duplicate.id}>
                  #{duplicate.id} · {duplicate.type.label} ·{" "}
                  {formatDate(duplicate.createdAt).toLocaleString(
                    DateTime.DATETIME_MED,
                  )}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 pt-1">
              <Checkbox
                checked={confirmDuplicate}
                onCheckedChange={(checked) =>
                  setConfirmedDuplicateKey(
                    checked === true ? duplicateContextKey : null,
                  )
                }
              />
              <span>Confirmo que es un incidente distinto</span>
            </label>
          </div>
        )}
        <SubmitButton
          loading={form.formState.isSubmitting}
          disabled={
            form.formState.isSubmitting ||
            (duplicates.length > 0 && !confirmDuplicate)
          }
          label={
            duplicates.length > 0
              ? "Registrar de todos modos"
              : "Registrar infracción"
          }
        />
      </form>
    </Form>
  );
}

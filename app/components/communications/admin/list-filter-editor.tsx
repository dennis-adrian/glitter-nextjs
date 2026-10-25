"use client";

import { SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import ListDetailsFields from "@/app/components/communications/admin/list-details-fields";
import ListMultiSelect from "@/app/components/communications/admin/list-multi-select";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Switch } from "@/app/components/ui/switch";
import {
  createDistributionListAction,
  previewDistributionListFilterAction,
  updateDistributionListAction,
} from "@/app/lib/distribution_lists/actions";
import {
  type AudienceCount,
  DISTRIBUTION_LIST_AREA_LABELS,
  DISTRIBUTION_LIST_AREAS,
  type DistributionListFilter,
  type DistributionListMember,
  formatAudienceCount,
  isEmptyDistributionListFilter,
  STATE_VALUES,
} from "@/app/lib/distribution_lists/definitions";

const PREVIEW_DELAY_MS = 400;

export type ListFilterOptions = {
  subcategories: { id: number; label: string; category: string }[];
  festivals: { id: number; name: string }[];
};

const CATEGORY_GROUPS: Record<string, string> = {
  ...DISTRIBUTION_LIST_AREA_LABELS,
};

type Preview =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      count: AudienceCount;
      names: DistributionListMember[];
    };

function toIds(values: string[]) {
  return values.map(Number);
}

function toValues(ids: readonly number[]) {
  return ids.map(String);
}

/**
 * A list that is computed again at every send: the criteria on the left, and
 * who they select today on the right, refreshed as the admin edits.
 */
export default function ListFilterEditor({
  listId,
  initialName = "",
  initialDescription = "",
  initialFilter,
  options,
  readOnly = false,
}: {
  /** Null while creating. */
  listId: number | null;
  initialName?: string;
  initialDescription?: string;
  initialFilter: DistributionListFilter;
  options: ListFilterOptions;
  /** An archived list: shown, never saved. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [filter, setFilter] = useState<DistributionListFilter>(initialFilter);
  const [preview, setPreview] = useState<Preview>({ state: "loading" });
  // Set by an edit, cleared by the answer: the numbers shown are a step behind.
  const [refreshing, setRefreshing] = useState(false);
  const latestRequest = useRef(0);
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    const request = ++latestRequest.current;
    const timer = setTimeout(async () => {
      try {
        const result = await previewDistributionListFilterAction(
          JSON.parse(filterKey),
        );
        // An older request that answers late must not overwrite a newer one.
        if (request !== latestRequest.current) return;
        setRefreshing(false);
        setPreview(
          result.success
            ? { state: "ready", count: result.count, names: result.names }
            : { state: "error", message: result.message },
        );
      } catch (error) {
        if (request !== latestRequest.current) return;
        setRefreshing(false);
        console.error("Error previewing a distribution list filter", error);
        setPreview({
          state: "error",
          message: "No se pudo calcular quiénes la reciben.",
        });
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filterKey]);

  function update(patch: Partial<DistributionListFilter>) {
    setRefreshing(true);
    setFilter((current) => ({ ...current, ...patch }));
  }

  function save() {
    startTransition(async () => {
      try {
        const input = {
          name: name.trim(),
          description: description.trim() || null,
          filter,
        };
        if (listId === null) {
          const result = await createDistributionListAction({
            kind: "filter",
            ...input,
          });
          if (!result.success) {
            toast.error(result.message);
            return;
          }
          toast.success(result.message);
          router.push(`/dashboard/communications/lists/${result.listId}`);
          return;
        }
        const result = await updateDistributionListAction({ listId, ...input });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error saving a distribution list", error);
        toast.error("No se pudo guardar la lista. Intentá de nuevo.");
      }
    });
  }

  const disabled = readOnly || isPending;
  const subcategoryOptions = options.subcategories.map((subcategory) => ({
    value: String(subcategory.id),
    label: subcategory.label,
    group: CATEGORY_GROUPS[subcategory.category] ?? "Otras",
  }));
  const festivalOptions = options.festivals.map((festival) => ({
    value: String(festival.id),
    label: festival.name,
  }));
  const stateOptions = STATE_VALUES.map((state) => ({
    value: state,
    label: state,
  }));

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lista</CardTitle>
          </CardHeader>
          <CardContent>
            <ListDetailsFields
              name={name}
              onNameChange={setName}
              description={description}
              onDescriptionChange={setDescription}
              disabled={disabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
            <p className="text-sm text-muted-foreground">
              Entran quienes cumplen todos los filtros que elijas; dentro de
              cada uno, alcanza con cualquiera de los valores. Se calcula de
              nuevo en cada envío.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium" id="list-areas-label">
                Área
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-labelledby="list-areas-label"
              >
                {DISTRIBUTION_LIST_AREAS.map((area) => {
                  const active = filter.areas.includes(area);
                  return (
                    <Button
                      key={area}
                      type="button"
                      size="sm"
                      aria-pressed={active}
                      variant={active ? "default" : "outline"}
                      disabled={disabled}
                      onClick={() =>
                        update({
                          areas: active
                            ? filter.areas.filter((value) => value !== area)
                            : [...filter.areas, area],
                        })
                      }
                    >
                      {DISTRIBUTION_LIST_AREA_LABELS[area]}
                    </Button>
                  );
                })}
              </div>
            </div>

            <ListMultiSelect
              id="list-subcategories"
              label="Categorías"
              placeholder="Agregar categoría"
              options={subcategoryOptions}
              selected={toValues(filter.subcategoryIds)}
              onChange={(values) => update({ subcategoryIds: toIds(values) })}
              disabled={disabled}
            />

            <ListMultiSelect
              id="list-states"
              label="Departamento"
              placeholder="Agregar departamento"
              options={stateOptions}
              selected={filter.states}
              onChange={(states) => update({ states })}
              disabled={disabled}
            />

            <ListMultiSelect
              id="list-confirmed-at"
              label="Con reserva confirmada en"
              hint="Cualquiera de estos festivales."
              placeholder="Agregar festival"
              options={festivalOptions}
              selected={toValues(filter.confirmedAtFestivalIds)}
              onChange={(values) =>
                update({ confirmedAtFestivalIds: toIds(values) })
              }
              disabled={disabled}
            />

            <ListMultiSelect
              id="list-not-confirmed-at"
              label="Sin reserva confirmada en"
              hint="Ninguno de estos festivales."
              placeholder="Agregar festival"
              options={festivalOptions}
              selected={toValues(filter.notConfirmedAtFestivalIds)}
              onChange={(values) =>
                update({ notConfirmedAtFestivalIds: toIds(values) })
              }
              disabled={disabled}
            />

            <div className="flex items-start justify-between gap-4">
              <div>
                <label
                  htmlFor="list-include-paused"
                  className="text-sm font-medium"
                >
                  Incluir pausados
                </label>
                <p className="text-xs text-muted-foreground">
                  Participantes con el perfil pausado.
                </p>
              </div>
              <Switch
                id="list-include-paused"
                checked={filter.includePaused}
                onCheckedChange={(includePaused) => update({ includePaused })}
                disabled={disabled}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quiénes la reciben hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3" aria-live="polite">
            <FilterPreview
              preview={preview}
              empty={isEmptyDistributionListFilter(filter)}
            />
            {refreshing && preview.state !== "loading" && (
              <p className="text-xs text-muted-foreground">Actualizando…</p>
            )}
          </CardContent>
        </Card>
        {!readOnly && (
          <Button
            type="button"
            className="w-full"
            disabled={isPending || !name.trim()}
            onClick={save}
          >
            <SaveIcon className="mr-2 h-4 w-4" aria-hidden />
            {isPending
              ? "Guardando…"
              : listId === null
                ? "Guardar lista"
                : "Guardar cambios"}
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterPreview({
  preview,
  empty,
}: {
  preview: Preview;
  empty: boolean;
}) {
  if (preview.state === "loading") {
    return <p className="text-sm text-muted-foreground">Calculando…</p>;
  }
  if (preview.state === "error") {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {preview.message}
      </p>
    );
  }
  const { count, names } = preview;
  const more = count.eligible - names.length;
  return (
    <>
      {empty && (
        <p className="text-sm text-muted-foreground">
          Sin filtros: son todos los participantes habilitados.
        </p>
      )}
      <p className="text-sm">
        Hoy pueden recibirlo{" "}
        <strong className="tabular-nums">
          {formatAudienceCount(count.eligible)}
        </strong>{" "}
        {count.eligible === 1 ? "participante" : "participantes"}
        {count.skipped > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · {formatAudienceCount(count.skipped)} no lo reciben
          </span>
        )}
      </p>
      {names.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Algunas de las personas">
          {names.map((member) => (
            <li key={member.userId} className="truncate">
              {member.name}
              <span className="text-muted-foreground"> · {member.email}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && (
        <p className="text-xs text-muted-foreground">
          y {formatAudienceCount(more)} más.
        </p>
      )}
    </>
  );
}

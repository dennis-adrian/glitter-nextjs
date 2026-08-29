"use client";

import FestivalTermsPreviewPanel from "@/app/components/festival-terms/preview-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import { Textarea } from "@/app/components/ui/textarea";
import RichTextEditor from "@/app/components/organisms/rich-text-editor";
import {
  TERMS_AUDIENCE_CATEGORIES,
  TERMS_FESTIVAL_TYPES,
} from "@/app/lib/festival-terms/constants";
import {
  CATEGORY_LABELS,
  FESTIVAL_TYPE_LABELS,
  KIND_LABELS,
  LAYOUT_LABELS,
  audienceSummary,
} from "@/app/lib/festival-terms/copy";
import { createEmptyEditorSection } from "@/app/lib/festival-terms/editor";
import type {
  EditorTermsSection,
  FestivalTermsVersionWithSections,
  TermsAudienceCategory,
  TermsFestivalType,
} from "@/app/lib/festival-terms/definitions";
import {
  discardFestivalTermsDraft,
  publishFestivalTermsDraft,
  saveFestivalTermsDraft,
} from "@/app/lib/festival-terms/actions";
import { cn } from "@/app/lib/utils";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

type FestivalTermsEditorProps = {
  draft: FestivalTermsVersionWithSections;
  initialSections: EditorTermsSection[];
  staleAcceptanceCount: number;
};

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function SortableSectionCard({
  section,
  index,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
}: {
  section: EditorTermsSection;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (next: EditorTermsSection) => void;
  onRemove: () => void;
}) {
  const isSchedule = section.kind === "schedule";
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.clientId });

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-70")}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-3 sm:p-6 sm:pb-4">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            className="mt-1 touch-none text-muted-foreground"
            aria-label="Reordenar sección"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base">
              {section.title.trim() || `Sección ${index + 1}`}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {KIND_LABELS[section.kind]} · {LAYOUT_LABELS[section.layout]} ·{" "}
              {audienceSummary(
                section.audienceCategories,
                section.audienceFestivalTypes,
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleExpand}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUpIcon className="mr-1 size-4" />
            ) : (
              <PencilIcon className="mr-1 size-4" />
            )}
            {expanded ? "Cerrar" : "Editar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={isSchedule}
            title={
              isSchedule
                ? "La sección de horarios no se puede eliminar"
                : undefined
            }
          >
            <Trash2Icon className="size-4" />
            <span className="sr-only">
              {isSchedule ? "No se puede eliminar horarios" : "Eliminar sección"}
            </span>
          </Button>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={section.title}
                onChange={(event) =>
                  onChange({ ...section, title: event.target.value })
                }
                placeholder="1. Aceptación de Términos"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              {isSchedule ? (
                <p className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  {KIND_LABELS.schedule}
                </p>
              ) : (
                <Select
                  value={section.kind}
                  onValueChange={(value) =>
                    onChange({
                      ...section,
                      kind: value as EditorTermsSection["kind"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rich_text">
                      {KIND_LABELS.rich_text}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Presentación</Label>
              <Select
                value={section.layout}
                onValueChange={(value) =>
                  onChange({
                    ...section,
                    layout: value as EditorTermsSection["layout"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain">{LAYOUT_LABELS.plain}</SelectItem>
                  <SelectItem value="accordion">
                    {LAYOUT_LABELS.accordion}
                  </SelectItem>
                  <SelectItem value="card">{LAYOUT_LABELS.card}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Categorías</legend>
              <p className="text-xs text-muted-foreground">
                Si no marcás ninguna, se muestra a todas.
              </p>
              {TERMS_AUDIENCE_CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={section.audienceCategories.includes(category)}
                    onCheckedChange={() =>
                      onChange({
                        ...section,
                        audienceCategories: toggleValue(
                          section.audienceCategories,
                          category,
                        ),
                      })
                    }
                  />
                  {CATEGORY_LABELS[category as TermsAudienceCategory]}
                </label>
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tipos de festival</legend>
              <p className="text-xs text-muted-foreground">
                Si no marcás ninguno, se muestra en todos.
              </p>
              {TERMS_FESTIVAL_TYPES.map((festivalType) => (
                <label
                  key={festivalType}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={section.audienceFestivalTypes.includes(festivalType)}
                    onCheckedChange={() =>
                      onChange({
                        ...section,
                        audienceFestivalTypes: toggleValue(
                          section.audienceFestivalTypes,
                          festivalType,
                        ),
                      })
                    }
                  />
                  {FESTIVAL_TYPE_LABELS[festivalType as TermsFestivalType]}
                </label>
              ))}
            </fieldset>
          </div>

          {section.kind === "rich_text" ? (
            <RichTextEditor
              variant="article"
              initialContent={section.bodyJson}
              placeholder="Escribí el contenido de esta sección. Usá / para insertar bloques."
              onChange={(json, html) =>
                onChange({
                  ...section,
                  bodyJson: json as unknown[],
                  bodyHtml: html,
                })
              }
            />
          ) : (
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Esta sección muestra los horarios calculados a partir de las fechas
              de cada festival. El texto legal no se edita aquí.
            </p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

const PREVIEW_HINT =
  "La vista previa usa el texto del editor; el HTML publicado se genera al guardar.";

export default function FestivalTermsEditor({
  draft,
  initialSections,
  staleAcceptanceCount,
}: FestivalTermsEditorProps) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [changelog, setChangelog] = useState(draft.changelog ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [previewCategory, setPreviewCategory] =
    useState<TermsAudienceCategory>("illustration");
  const [previewFestivalType, setPreviewFestivalType] =
    useState<TermsFestivalType>("glitter");
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const previewSections = useMemo(
    () =>
      sections.map((section, index) => ({
        id: index + 1,
        versionId: draft.id,
        sortOrder: index,
        kind: section.kind,
        layout: section.layout,
        title: section.title.trim() || null,
        bodyJson: section.bodyJson,
        bodyHtml: section.bodyHtml ?? null,
        audienceCategories: section.audienceCategories,
        audienceFestivalTypes: section.audienceFestivalTypes,
        updatedAt: draft.updatedAt,
        createdAt: draft.createdAt,
      })),
    [draft.createdAt, draft.id, draft.updatedAt, sections],
  );

  function toggleExpanded(clientId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections((current) => {
      const oldIndex = current.findIndex((section) => section.clientId === active.id);
      const newIndex = current.findIndex((section) => section.clientId === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  function payload() {
    return { changelog, sections };
  }

  function save() {
    startTransition(async () => {
      const result = await saveFestivalTermsDraft(payload());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishFestivalTermsDraft(payload());
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push("/dashboard/terms");
      router.refresh();
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await discardFestivalTermsDraft();
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push("/dashboard/terms");
      router.refresh();
    });
  }

  const previewPanelProps = {
    sections: previewSections,
    category: previewCategory,
    festivalType: previewFestivalType,
    onCategoryChange: setPreviewCategory,
    onFestivalTypeChange: setPreviewFestivalType,
    hint: PREVIEW_HINT,
  } as const;

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 py-3 backdrop-blur">
        <div className="min-w-0">
          <Link
            href="/dashboard/terms"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Términos y condiciones
          </Link>
          <h1 className="text-lg font-semibold sm:text-xl">
            Editar borrador · v{draft.versionNumber}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="xl:hidden"
            onClick={() => setPreviewOpen(true)}
          >
            <EyeIcon className="mr-1 size-4" />
            Vista previa
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDiscardOpen(true)}>
            Descartar
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={save}>
            Guardar
          </Button>
          <Button type="button" size="sm" disabled={isPending} onClick={() => setPublishOpen(true)}>
            Publicar
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="changelog">Nota de versión (solo admin)</Label>
        <Textarea
          id="changelog"
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
          placeholder="Qué cambió en esta versión"
          rows={2}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
        <div className="space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={sections.map((section) => section.clientId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sections.map((section, index) => (
                  <SortableSectionCard
                    key={section.clientId}
                    section={section}
                    index={index}
                    expanded={expandedIds.has(section.clientId)}
                    onToggleExpand={() => toggleExpanded(section.clientId)}
                    onChange={(next) =>
                      setSections((current) =>
                        current.map((item) =>
                          item.clientId === next.clientId ? next : item,
                        ),
                      )
                    }
                    onRemove={() => {
                      if (section.kind === "schedule") return;
                      setExpandedIds((current) => {
                        const next = new Set(current);
                        next.delete(section.clientId);
                        return next;
                      });
                      setSections((current) =>
                        current.filter((item) => item.clientId !== section.clientId),
                      );
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = createEmptyEditorSection();
                setSections((current) => [...current, next]);
                setExpandedIds((current) => new Set(current).add(next.clientId));
              }}
            >
              <PlusIcon className="mr-2 size-4" />
              Agregar sección
            </Button>
            {expandedIds.size > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setExpandedIds(new Set())}
              >
                <ChevronDownIcon className="mr-2 size-4 rotate-180" />
                Contraer todas
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Los horarios son una sola sección fija: se puede reordenar, no
            editar ni duplicar.
          </p>
        </div>

        <aside className="hidden min-h-0 xl:sticky xl:top-24 xl:block xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex max-h-[70vh] min-h-0 flex-col">
                <FestivalTermsPreviewPanel {...previewPanelProps} />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[90dvh] max-h-[90dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>Vista previa</SheetTitle>
            <SheetDescription>
              Así se ve el documento en un ancho de teléfono, con los filtros de
              audiencia.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col">
              <FestivalTermsPreviewPanel {...previewPanelProps} />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar esta versión?</AlertDialogTitle>
            <AlertDialogDescription>
              {staleAcceptanceCount > 0
                ? `Hay ${staleAcceptanceCount} ${staleAcceptanceCount === 1 ? "inscripción" : "inscripciones"} en festivales activos que deberán volver a aceptar los términos.`
                : "No hay inscripciones en festivales activos que deban volver a aceptar por ahora."}{" "}
              Los participantes de festivales nuevos seguirán aceptando términos
              al inscribirse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={publish}>Publicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar el borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Se perderán los cambios no publicados de esta versión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

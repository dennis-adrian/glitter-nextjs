"use client";

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
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import StatusDot from "@/app/components/atoms/status-dot";
import Heading from "@/app/components/atoms/heading";
import CountLabel from "@/app/components/molecules/count-label";
import EntityThumbnail from "@/app/components/molecules/entity-thumbnail";
import ImpactConfirmDialog from "@/app/components/organisms/impact-confirm-dialog";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Input } from "@/app/components/ui/input";
import {
  deleteCategory,
  reorderCategories,
  setCategoryVisibility,
} from "@/app/lib/categories/actions";
import {
  formatDeleteBlockedMessage,
  formatDeleteWarningMessage,
  VISIBILITY_COPY,
  visibilityTone,
  categoryParticipantsHref,
} from "@/app/lib/categories/copy";
import { isDeleteBlocked, unverifiedLinkedCounts } from "@/app/lib/categories/delete";
import type { AdminCategory, ManagementArea } from "@/app/lib/categories/definitions";
import { participantCount } from "@/app/lib/categories/definitions";
import { groupByManagementArea } from "@/app/lib/categories/group";
import { cn } from "@/app/lib/utils";

type CategoriesListProps = {
  categories: AdminCategory[];
};

function SortableCategoryRow({
  category,
  disableReorder,
  onDelete,
  onVisibility,
}: {
  category: AdminCategory;
  disableReorder?: boolean;
  onDelete: () => void;
  onVisibility: (visibility: AdminCategory["visibility"]) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: disableReorder });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex flex-col gap-2 py-3 sm:flex-row sm:items-center",
        isDragging && "z-10 bg-background opacity-90 shadow-md",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
          aria-label="Arrastrar para reordenar"
          disabled={disableReorder}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-5" />
        </button>
        <EntityThumbnail src={category.imageUrl} alt={category.label} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{category.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <StatusDot
              tone={visibilityTone(category.visibility)}
              label={VISIBILITY_COPY[category.visibility].listLabel}
            />
            <CountLabel
              count={participantCount(category)}
              singular="participante"
              plural="participantes"
            />
          </div>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger variant="ghost" size="icon" className="self-end sm:self-auto">
          <MoreHorizontalIcon className="size-4" />
          <span className="sr-only">Acciones</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/categories/${category.id}/edit`}>Editar</Link>
          </DropdownMenuItem>
          {category.visibility !== "hidden" ? (
            <DropdownMenuItem onClick={() => onVisibility("hidden")}>
              Ocultar
            </DropdownMenuItem>
          ) : null}
          {category.visibility !== "listed" ? (
            <DropdownMenuItem onClick={() => onVisibility("listed")}>
              Cerrar
            </DropdownMenuItem>
          ) : null}
          {category.visibility !== "selectable" ? (
            <DropdownMenuItem onClick={() => onVisibility("selectable")}>
              Activar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="text-destructive"
            onClick={onDelete}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AreaSection({
  area,
  label,
  items,
  disableReorder,
  onDelete,
  onVisibility,
  onReorder,
}: {
  area: ManagementArea;
  label: string;
  items: AdminCategory[];
  disableReorder?: boolean;
  onDelete: (category: AdminCategory) => void;
  onVisibility: (
    category: AdminCategory,
    visibility: AdminCategory["visibility"],
  ) => void;
  onReorder: (area: ManagementArea, items: AdminCategory[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (disableReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(area, arrayMove(items, oldIndex, newIndex));
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{label}</h2>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/categories/new?area=${area}`}>
            <PlusIcon className="mr-1 size-4" />
            Añadir en esta área
          </Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay categorías en esta área.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y">
              {items.map((category) => (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  onDelete={() => onDelete(category)}
                  disableReorder={disableReorder}
                  onVisibility={(visibility) =>
                    onVisibility(category, visibility)
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

export default function CategoriesList({ categories }: CategoriesListProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(categories);
  const [pendingId, setPendingDelete] = useState<AdminCategory | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(categories);
  }, [categories]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  }, [items, query]);

  const grouped = groupByManagementArea(filtered);

  function handleReorder(area: ManagementArea, nextItems: AdminCategory[]) {
    const previous = items;
    const other = items.filter((item) => item.category !== area);
    const merged = [...other, ...nextItems];
    setItems(merged);
    startTransition(async () => {
      const result = await reorderCategories({
        category: area,
        items: nextItems.map((item, index) => ({
          id: item.id,
          sortOrder: index,
        })),
      });
      if (!result.success) {
        toast.error(result.message);
        setItems(previous);
        return;
      }
      router.refresh();
    });
  }

  function handleVisibility(
    category: AdminCategory,
    visibility: AdminCategory["visibility"],
  ) {
    const previous = items;
    setItems((current) =>
      current.map((item) =>
        item.id === category.id ? { ...item, visibility } : item,
      ),
    );
    startTransition(async () => {
      const result = await setCategoryVisibility(category.id, visibility);
      if (!result.success) {
        toast.error(result.message);
        setItems(previous);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  const blocked = pendingId ? isDeleteBlocked(pendingId) : false;
  const warning = pendingId
    ? formatDeleteWarningMessage(unverifiedLinkedCounts(pendingId))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading level={1} className="text-2xl md:text-3xl lg:text-4xl">
            Categorías
          </Heading>
          <p className="text-sm text-muted-foreground">
            {items.length} en el catálogo
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/categories/new">
            <PlusIcon className="mr-1 size-4" />
            Crear categoría
          </Link>
        </Button>
      </div>
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre"
          className="pl-9"
        />
      </div>
      <div className="space-y-4">
        {grouped.map((group) => (
          <AreaSection
            key={group.area}
            area={group.area}
            label={group.label}
            items={group.items}
            disableReorder={query.trim().length > 0}
            onDelete={setPendingDelete}
            onVisibility={handleVisibility}
            onReorder={handleReorder}
          />
        ))}
      </div>
      <ImpactConfirmDialog
        open={pendingId != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingId ? `Eliminar ${pendingId.label}` : "Eliminar categoría"}
        description={
          pendingId && blocked
            ? formatDeleteBlockedMessage(
                pendingId.label,
                pendingId.verified,
                pendingId.stands,
              )
            : warning ||
              "Esta acción no se puede deshacer."
        }
        items={
          pendingId
            ? [
                {
                  label: "Perfiles verificados",
                  count: pendingId.verified,
                  tone: pendingId.verified > 0 ? "danger" : "default",
                },
                {
                  label: "Stands",
                  count: pendingId.stands,
                  tone: pendingId.stands > 0 ? "danger" : "default",
                },
                {
                  label: "Pendientes",
                  count: pendingId.pending,
                },
                {
                  label: "Pausados",
                  count: pendingId.paused,
                },
                {
                  label: "Rechazados",
                  count: pendingId.rejected,
                },
                {
                  label: "Deshabilitados",
                  count: pendingId.banned,
                },
              ]
            : []
        }
        blocked={blocked}
        secondaryHref={
          pendingId && blocked && pendingId.verified > 0
            ? categoryParticipantsHref(pendingId.category)
            : undefined
        }
        secondaryLabel={
          pendingId && blocked && pendingId.verified > 0
            ? "Ver perfiles"
            : undefined
        }
        confirmLabel="Eliminar categoría"
        confirmPending={isPending}
        onConfirm={() => {
          if (!pendingId || blocked) return;
          const id = pendingId.id;
          startTransition(async () => {
            const result = await deleteCategory(id);
            if (!result.success) {
              toast.error(result.message);
              return;
            }
            toast.success(result.message);
            setPendingDelete(null);
            setItems((current) => current.filter((item) => item.id !== id));
            router.refresh();
          });
        }}
      />
    </div>
  );
}

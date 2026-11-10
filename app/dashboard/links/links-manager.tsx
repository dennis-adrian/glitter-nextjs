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
  ExternalLinkIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import SiteLinkIcon from "@/app/components/links/site-link-icon";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import {
  createSiteLink,
  createSocialLink,
  deleteSiteLink,
  reorderSiteLinks,
  setSiteLinkVisible,
  setSocialPosition,
  updateSiteLink,
  updateSocialLink,
} from "@/app/lib/links/actions";
import {
  SITE_LINK_ICONS,
  SITE_LINK_ICON_LABELS,
  SITE_LINK_LABEL_MAX,
  SOCIAL_NETWORKS,
  SOCIAL_NETWORK_FIELDS,
  SOCIAL_POSITIONS,
  SOCIAL_POSITION_LABELS,
  isSocialNetwork,
  socialValueFromHref,
  toSiteLinkIcon,
  type SiteLinkIcon as SiteLinkIconName,
  type SiteLinkKind,
  type SiteLinkRow,
  type SocialNetwork,
  type SocialPosition,
} from "@/app/lib/links/definitions";
import { cn } from "@/app/lib/utils";

const clicksFormat = new Intl.NumberFormat("es-BO");

function clicksLabel(count: number) {
  return `${clicksFormat.format(count)} ${count === 1 ? "clic" : "clics"}`;
}

function SortableRow({
  link,
  disabled,
  onEdit,
  onDelete,
  onToggleVisible,
}: {
  link: SiteLinkRow;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisible: (visible: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Arrastrar para reordenar ${link.label}`}
        >
          <GripVerticalIcon className="size-5" />
        </button>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted",
            !link.isVisible && "opacity-50",
          )}
        >
          <SiteLinkIcon icon={toSiteLinkIcon(link.icon)} className="size-5" />
        </span>
        <div className={cn("min-w-0 flex-1", !link.isVisible && "opacity-60")}>
          <p className="text-sm font-medium break-words">{link.label}</p>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {clicksLabel(link.clickCount)} · {link.href}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`link-visible-${link.id}`}
            className="text-xs whitespace-nowrap text-muted-foreground"
          >
            Visible
          </Label>
          <Switch
            id={`link-visible-${link.id}`}
            checked={link.isVisible}
            disabled={disabled}
            onCheckedChange={onToggleVisible}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <PencilIcon className="mr-1 size-4" />
          Editar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`Eliminar ${link.label}`}
        >
          <Trash2Icon className="size-4 text-destructive" />
        </Button>
      </div>
    </li>
  );
}

/** `"new"` adds one; a row edits it. */
type FormTarget = "new" | SiteLinkRow;

/** The form that is open, if any, and for which kind. */
type Editing = null | { kind: SiteLinkKind; target: FormTarget };

function LinkFormDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: FormTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editing === "new" ? null : editing;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [href, setHref] = useState(existing?.href ?? "");
  const [icon, setIcon] = useState<SiteLinkIconName>(
    existing ? toSiteLinkIcon(existing.icon) : "link",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      const input = { label, href, icon };
      const res = existing
        ? await updateSiteLink(existing.id, input)
        : await createSiteLink(input);
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success(existing ? "Enlace actualizado" : "Enlace agregado");
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {existing ? "Editar enlace" : "Nuevo enlace"}
            </DialogTitle>
            <DialogDescription>
              Se muestra en la página de enlaces con este título e ícono.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-link-label">Título</Label>
            <Input
              id="site-link-label"
              value={label}
              maxLength={SITE_LINK_LABEL_MAX}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Pre-registro Festicker"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="site-link-href">Enlace</Label>
            <Input
              id="site-link-href"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder="https://… , /store o un correo"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
            <p className="text-xs text-muted-foreground">
              Una dirección web, una ruta de este sitio (empieza con /) o un
              correo.
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Ícono</legend>
            <div className="flex flex-wrap gap-2">
              {SITE_LINK_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={icon === name}
                  aria-label={SITE_LINK_ICON_LABELS[name]}
                  title={SITE_LINK_ICON_LABELS[name]}
                  onClick={() => setIcon(name)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    icon === name &&
                      "border-primary bg-primary/10 text-primary hover:text-primary",
                  )}
                >
                  <SiteLinkIcon icon={name} className="size-5" />
                </button>
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A social icon asks only for what its network needs: a username, a number
 * or a URL. Its network is picked once, when it is added.
 */
function SocialFormDialog({
  editing,
  available,
  onClose,
  onSaved,
}: {
  editing: FormTarget;
  /** The networks with no icon yet. */
  available: SocialNetwork[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editing === "new" ? null : editing;
  const existingNetwork =
    existing && isSocialNetwork(existing.icon) ? existing.icon : null;
  const [network, setNetwork] = useState<SocialNetwork | null>(
    existingNetwork ?? (available.length === 1 ? available[0] : null),
  );
  const [value, setValue] = useState(
    existing && existingNetwork
      ? socialValueFromHref(existingNetwork, existing.href)
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const field = network ? SOCIAL_NETWORK_FIELDS[network] : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!network) return;
    setError(null);
    startSaving(async () => {
      const res = existing
        ? await updateSocialLink(existing.id, value)
        : await createSocialLink({ network, value });
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success(existing ? "Ícono actualizado" : "Ícono agregado");
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {existingNetwork
                ? `Editar ícono de ${SITE_LINK_ICON_LABELS[existingNetwork]}`
                : "Nuevo ícono social"}
            </DialogTitle>
            <DialogDescription>
              Se muestra como un ícono bajo la descripción, sin título.
            </DialogDescription>
          </DialogHeader>
          {existing ? null : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Red</legend>
              <div className="flex flex-wrap gap-2">
                {available.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={network === name}
                    onClick={() => {
                      setNetwork(name);
                      setError(null);
                    }}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      network === name &&
                        "border-primary bg-primary/10 text-primary hover:text-primary",
                    )}
                  >
                    <SiteLinkIcon icon={name} className="size-5" />
                    {SITE_LINK_ICON_LABELS[name]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {field ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="social-link-value">{field.prompt}</Label>
              <Input
                id="social-link-value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <p className="text-xs text-muted-foreground wrap-anywhere">
                Ejemplo: {field.example}
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || !network}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What differs between the list of links and the row of social icons. */
const SECTION_COPY: Record<
  SiteLinkKind,
  {
    heading: string;
    description: string;
    add: string;
    empty: string;
    deleted: string;
    deleteTitle: string;
  }
> = {
  social: {
    heading: "Íconos sociales",
    description:
      "Tus redes, como íconos bajo la descripción. Uno por red, sin título.",
    add: "Nuevo ícono social",
    empty: "Todavía no hay íconos sociales.",
    deleted: "Ícono eliminado",
    deleteTitle: "¿Eliminar este ícono?",
  },
  link: {
    heading: "Enlaces",
    description: "Los botones de la página, con su título e ícono.",
    add: "Nuevo enlace",
    empty: "Todavía no hay enlaces. Agrega el primero.",
    deleted: "Enlace eliminado",
    deleteTitle: "¿Eliminar este enlace?",
  },
};

/** Whether the row of social icons goes above the links or below them. */
function SocialPositionPicker({ initial }: { initial: SocialPosition }) {
  const router = useRouter();
  const [position, setPosition] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function choose(next: SocialPosition) {
    if (next === position) return;
    const previous = position;
    setPosition(next);
    startTransition(async () => {
      const res = await setSocialPosition(next);
      if (!res.success) {
        toast.error(res.message);
        setPosition(previous);
        return;
      }
      router.refresh();
    });
  }

  return (
    <fieldset className="space-y-2" disabled={isPending}>
      <legend className="text-sm font-medium">
        Posición de los íconos sociales
      </legend>
      <p className="text-xs text-muted-foreground">
        Arriba, bajo la descripción, o abajo, después de los enlaces.
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {SOCIAL_POSITIONS.map((value) => (
          <label
            key={value}
            className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="social-position"
              value={value}
              checked={position === value}
              onChange={() => choose(value)}
              className="size-4 accent-primary"
            />
            {SOCIAL_POSITION_LABELS[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One kind's rows: ordered, hidden and deleted apart from the other's. */
function LinksSection({
  kind,
  links,
  canAdd = true,
  onAdd,
  onEdit,
  children,
}: {
  /** Shown under the rows: settings that belong to this kind alone. */
  children?: React.ReactNode;
  kind: SiteLinkKind;
  links: SiteLinkRow[];
  /** False once there is nothing left to add (every network has its icon). */
  canAdd?: boolean;
  onAdd: () => void;
  onEdit: (link: SiteLinkRow) => void;
}) {
  const router = useRouter();
  const copy = SECTION_COPY[kind];
  const [items, setItems] = useState(links);
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<SiteLinkRow | null>(null);

  // The server's list replaces the local one whenever a refresh brings it.
  const [syncedLinks, setSyncedLinks] = useState(links);
  if (syncedLinks !== links) {
    setSyncedLinks(links);
    setItems(links);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    startTransition(async () => {
      const res = await reorderSiteLinks(
        kind,
        next.map((item) => item.id),
      );
      if (!res.success) {
        toast.error(res.message);
        setItems(previous);
        return;
      }
      router.refresh();
    });
  }

  function toggleVisible(link: SiteLinkRow, isVisible: boolean) {
    startTransition(async () => {
      const res = await setSiteLinkVisible(link.id, isVisible);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === link.id ? { ...item, isVisible } : item,
        ),
      );
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const { id } = deleting;
    startTransition(async () => {
      const res = await deleteSiteLink(id);
      setDeleting(null);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(copy.deleted);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3" aria-labelledby={`links-section-${kind}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`links-section-${kind}`} className="text-lg font-semibold">
            {copy.heading}
          </h2>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        {canAdd ? (
          <Button type="button" size="sm" onClick={onAdd}>
            <PlusIcon className="mr-2 size-4" />
            {copy.add}
          </Button>
        ) : null}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((link) => (
                <SortableRow
                  key={link.id}
                  link={link}
                  disabled={isPending}
                  onEdit={() => onEdit(link)}
                  onDelete={() => setDeleting(link)}
                  onToggleVisible={(visible) => toggleVisible(link, visible)}
                />
              ))}
            </ul>
          )}
        </SortableContext>
      </DndContext>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `"${deleting.label}" se quitará de la página y se perderá su conteo de clics. Si solo quieres dejar de mostrarlo, ocúltalo.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {children}
    </section>
  );
}

export default function LinksManager({
  initialLinks,
  initialSocialPosition = "top",
  publicUrl,
}: {
  initialLinks: SiteLinkRow[];
  initialSocialPosition?: SocialPosition;
  publicUrl: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);

  const socials = initialLinks.filter((link) => link.kind === "social");
  const links = initialLinks.filter((link) => link.kind !== "social");
  const availableNetworks = SOCIAL_NETWORKS.filter(
    (network) => !socials.some((link) => link.icon === network),
  );

  const closeForm = () => setEditing(null);
  const savedForm = () => {
    setEditing(null);
    router.refresh();
  };
  // A fresh form for each row, never the last one's fields.
  const formKey = editing
    ? `${editing.kind}-${editing.target === "new" ? "new" : editing.target.id}`
    : undefined;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="space-y-3">
        <Button variant="outline" asChild>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon className="mr-2 size-4" />
            Ver página
          </a>
        </Button>
        <p className="text-sm text-muted-foreground wrap-anywhere">
          Dirección para la bio:{" "}
          <span className="font-medium">{publicUrl}</span>
        </p>
      </div>

      <LinksSection
        kind="social"
        links={socials}
        canAdd={availableNetworks.length > 0}
        onAdd={() => setEditing({ kind: "social", target: "new" })}
        onEdit={(link) => setEditing({ kind: "social", target: link })}
      >
        <SocialPositionPicker initial={initialSocialPosition} />
      </LinksSection>
      <LinksSection
        kind="link"
        links={links}
        onAdd={() => setEditing({ kind: "link", target: "new" })}
        onEdit={(link) => setEditing({ kind: "link", target: link })}
      />

      {editing?.kind === "link" ? (
        <LinkFormDialog
          key={formKey}
          editing={editing.target}
          onClose={closeForm}
          onSaved={savedForm}
        />
      ) : null}
      {editing?.kind === "social" ? (
        <SocialFormDialog
          key={formKey}
          editing={editing.target}
          available={availableNetworks}
          onClose={closeForm}
          onSaved={savedForm}
        />
      ) : null}
    </div>
  );
}

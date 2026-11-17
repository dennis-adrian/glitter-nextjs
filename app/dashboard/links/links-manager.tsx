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
  ArrowLeftIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  EyeIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import LinksPageView from "@/app/components/links/links-page-view";
import SiteLinkIcon, {
  SiteLinkThumb,
} from "@/app/components/links/site-link-icon";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/app/components/ui/drawer";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import {
  createSiteLink,
  createSocialLink,
  deleteSiteLink,
  fetchSiteLinkImage,
  reorderSiteLinks,
  setSiteLinkVisible,
  setSocialPosition,
  updateLinksHeader,
  updateSiteLink,
  updateSocialLink,
} from "@/app/lib/links/actions";
import {
  DEFAULT_LINKS_HEADER,
  LINKS_DESCRIPTION_MAX,
  LINKS_PATH,
  LINKS_TITLE_MAX,
  NO_ICON,
  SITE_LINK_ICON_LABELS,
  SITE_LINK_LAYOUTS,
  SITE_LINK_LAYOUT_LABELS,
  SITE_LINK_LABEL_MAX,
  SOCIAL_NETWORKS,
  SOCIAL_NETWORK_FIELDS,
  SOCIAL_POSITIONS,
  SOCIAL_POSITION_LABELS,
  isSocialNetwork,
  isWithinSchedule,
  parseScheduleInput,
  parseSiteLinkHref,
  scheduleLabel,
  socialValueFromHref,
  thumbnailMode,
  toScheduleInput,
  toSiteLinkLayout,
  type LinksHeader,
  type PublicSiteLink,
  type SiteLinkLayout,
  type ThumbnailMode,
  type SiteLinkKind,
  type SiteLinkRow,
  type SocialNetwork,
  type SocialPosition,
} from "@/app/lib/links/definitions";
import ThumbnailField from "@/app/dashboard/links/thumbnail-field";
import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";
import GlitterLogo from "@/app/components/landing/glitter-logo";
import Image from "next/image";

type ActionResult = { success: true } | { success: false; message: string };

/**
 * An action's answer, or a refusal in its place when the call itself fails
 * (no connection, a server error). Every caller already undoes its optimistic
 * change and says why on a refusal, so a failed call takes that same path
 * instead of escaping the transition to the error page.
 */
async function attempt(
  run: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    return await run();
  } catch (error) {
    console.error("links manager action failed", error);
    return {
      success: false,
      message: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
}

const clicksFormat = new Intl.NumberFormat("es-BO");

function clicksLabel(count: number) {
  return `${clicksFormat.format(count)} ${count === 1 ? "clic" : "clics"}`;
}

function SortableRow({
  link,
  now,
  disabled,
  onEdit,
  onDelete,
  onToggleVisible,
}: {
  link: SiteLinkRow;
  /** When the page was read, for where the link is in its schedule. */
  now: Date;
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
    // Held while a change is on its way, so each reorder's undo is its own.
  } = useSortable({ id: link.id, disabled });
  const schedule = scheduleLabel(link, now);
  const shownNow = isWithinSchedule(link, now);

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
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          {...attributes}
          {...listeners}
          disabled={disabled}
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
          {link.icon === NO_ICON && !link.imageUrl ? (
            <span className="text-xs text-muted-foreground">Aa</span>
          ) : (
            <SiteLinkThumb
              link={link}
              className="size-5"
              imageClassName="size-10"
            />
          )}
        </span>
        <div className={cn("min-w-0 flex-1", !link.isVisible && "opacity-60")}>
          <p className="text-sm font-medium break-words">{link.label}</p>
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {clicksLabel(link.clickCount)} · {link.href}
          </p>
          {schedule ? (
            <p
              className={cn(
                "mt-0.5 flex items-start gap-1 text-xs break-words",
                shownNow
                  ? "text-muted-foreground"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              <CalendarClockIcon
                aria-hidden
                className="mt-0.5 size-3 shrink-0"
              />
              {schedule}
            </p>
          ) : null}
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

/**
 * A form as the editor's own screen, in place of the lists: a bar that stays
 * in view with the way back, what is being edited and the save button, and
 * the fields under it. Not an overlay, so the preview beside it (or behind
 * its button, on a phone) stays in reach while editing.
 */
function EditorScreen({
  title,
  description,
  error,
  isSaving,
  canSave = true,
  hasChanges,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  error: string | null;
  isSaving: boolean;
  /** False while there is nothing that could be saved yet. */
  canSave?: boolean;
  /** Whether leaving now would lose something typed or picked. */
  hasChanges: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  children: React.ReactNode;
}) {
  // Asked only when there is something to lose; otherwise the arrow leaves.
  const [leaving, setLeaving] = useState(false);

  return (
    <form
      onSubmit={onSubmit}
      aria-label={title}
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 flex flex-col gap-2 border-b border-border bg-background px-4 py-3 md:-mx-6 md:px-6 xl:mx-0 xl:px-0">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Cancelar"
            title="Volver sin guardar"
            // Not while a save is on its way: leaving now and opening
            // another row would let that save's answer close the new one.
            disabled={isSaving}
            onClick={() => (hasChanges ? setLeaving(true) : onClose())}
          >
            <ArrowLeftIcon className="size-5" />
          </Button>
          <h2 className="min-w-0 flex-1 text-lg font-semibold break-words">
            {title}
          </h2>
          <Button
            type="submit"
            className="shrink-0"
            disabled={isSaving || !canSave}
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
        {/* Here, where it is in view whatever field was being filled in. */}
        {error ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {/* Held still while a save is on its way: an edit made now would not
          be in it, and its answer closes the editor. */}
      <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-5">
        {children}
      </fieldset>
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Lo que cambiaste en “{title}” no se ha guardado y se perderá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={onClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/** The form that is open, if any, and for which kind. */
type Editing = null | { kind: SiteLinkKind; target: FormTarget };

/**
 * A link as its open form has it, saved or not: what the preview shows in
 * place of the saved one (or after the last, for a new link).
 */
type LinkDraft = Omit<PublicSiteLink, "id" | "kind"> & {
  id: number | null;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
};

function LinkFormDialog({
  editing,
  onClose,
  onSaved,
  onDraftChange,
}: {
  editing: FormTarget;
  onClose: () => void;
  onSaved: () => void;
  /** Called with what the form holds each time it changes. */
  onDraftChange: (draft: LinkDraft) => void;
}) {
  const existing = editing === "new" ? null : editing;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [href, setHref] = useState(existing?.href ?? "");
  // The icon and the image are kept apart from the mode, so switching between
  // the three and back loses neither.
  const [mode, setMode] = useState<ThumbnailMode>(
    existing ? thumbnailMode(existing) : "icon",
  );
  const [icon, setIcon] = useState(
    existing && existing.icon !== NO_ICON ? existing.icon : "link",
  );
  const [iconSvg, setIconSvg] = useState<string | null>(
    existing?.iconSvg ?? null,
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    existing?.imageUrl ?? null,
  );
  const [layout, setLayout] = useState<SiteLinkLayout>(
    toSiteLinkLayout(existing?.layout),
  );
  // As `datetime-local` values, in Bolivia's time.
  const [visibleFrom, setVisibleFrom] = useState(
    toScheduleInput(existing?.visibleFrom),
  );
  const [visibleUntil, setVisibleUntil] = useState(
    toScheduleInput(existing?.visibleUntil),
  );
  // Off for most links, which are simply shown: the dates stay out of the
  // way until someone wants them. Off also means saved without dates, though
  // the fields keep theirs in case it is turned back on.
  const [scheduled, setScheduled] = useState(
    Boolean(existing?.visibleFrom || existing?.visibleUntil),
  );
  const from = scheduled ? (parseScheduleInput(visibleFrom) ?? null) : null;
  const until = scheduled ? (parseScheduleInput(visibleUntil) ?? null) : null;
  const fromTime = from?.getTime() ?? null;
  const untilTime = until?.getTime() ?? null;
  // Until the person chooses a thumbnail themselves, a new link takes the
  // image its own page offers, as Linktree does.
  const thumbnailChosen = useRef(existing != null);
  // Bumped by every edit of the address and every thumbnail choice, so an
  // image that arrives after either is dropped: it is for another address,
  // or a choice made since replaced it.
  const hrefRevision = useRef(0);
  const choiceRevision = useRef(0);
  function chooseThumbnail() {
    thumbnailChosen.current = true;
    choiceRevision.current += 1;
  }
  const [isFetchingImage, setIsFetchingImage] = useState(false);
  // An upload still on its way would land after the save, and be lost.
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  // A web address or a page of this site: what has a page to take an image
  // from. An email has none.
  const isWebLink =
    /^(https?:\/\/)?[^\s/@]+\.[^\s@]+$/i.test(href.trim()) ||
    /^\/(?!\/)\S*$/.test(href.trim());

  async function takeLinkImage({ quiet }: { quiet: boolean }) {
    if (isFetchingImage || !isWebLink) return;
    setIsFetchingImage(true);
    const startedHref = hrefRevision.current;
    const startedChoice = choiceRevision.current;
    try {
      const res = await fetchSiteLinkImage(href);
      const superseded =
        hrefRevision.current !== startedHref ||
        choiceRevision.current !== startedChoice;
      if (res.success) {
        // Found on its own, it must not undo a choice made while it loaded;
        // asked for, it still yields to an address or choice made since.
        if (!superseded && (!quiet || !thumbnailChosen.current)) {
          setImageUrl(res.imageUrl);
          setMode("image");
        }
      } else if (!quiet && !superseded) {
        toast.error(res.message);
      }
    } catch (fetchError) {
      console.error("link image", fetchError);
      if (!quiet) toast.error("No se pudo buscar la imagen del enlace.");
    } finally {
      setIsFetchingImage(false);
    }
  }

  // What the three thumbnail choices come to for the link itself.
  const shown = {
    icon: mode === "none" ? NO_ICON : icon,
    iconSvg: mode === "none" ? null : iconSvg,
    imageUrl: mode === "image" ? imageUrl : null,
  };

  // The preview follows the form as it is typed in, before any save.
  const existingId = existing?.id ?? null;
  const existingHref = existing?.href ?? null;
  useEffect(() => {
    // Never an address that would not be saved: the preview's card is a
    // real link.
    const parsed = parseSiteLinkHref(href);
    onDraftChange({
      id: existingId,
      label: label.trim() || "Nuevo enlace",
      href: parsed.ok ? parsed.href : (existingHref ?? "#"),
      icon: shown.icon,
      iconSvg: shown.iconSvg,
      imageUrl: shown.imageUrl,
      layout,
      visibleFrom: fromTime == null ? null : new Date(fromTime),
      visibleUntil: untilTime == null ? null : new Date(untilTime),
    });
  }, [
    onDraftChange,
    existingId,
    existingHref,
    label,
    href,
    shown.icon,
    shown.iconSvg,
    shown.imageUrl,
    layout,
    fromTime,
    untilTime,
  ]);

  // What saving would send, and so what leaving without saving would lose.
  const input = {
    label,
    href,
    icon: shown.icon,
    imageUrl: shown.imageUrl,
    layout,
    visibleFrom: scheduled ? visibleFrom : "",
    visibleUntil: scheduled ? visibleUntil : "",
  };
  const current = JSON.stringify(input);
  const [opened] = useState(current);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isUploadingImage) return;
    setError(null);
    if (mode === "image" && !imageUrl) {
      setError("Agrega una imagen, o elige un ícono o ninguna miniatura.");
      return;
    }
    if (from && until && until <= from) {
      setError("El enlace debe dejar de mostrarse después de empezar.");
      return;
    }
    startSaving(async () => {
      const res = await attempt(() =>
        existing ? updateSiteLink(existing.id, input) : createSiteLink(input),
      );
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success(existing ? "Enlace actualizado" : "Enlace agregado");
      onSaved();
    });
  }

  return (
    <EditorScreen
      title={existing ? "Editar enlace" : "Nuevo enlace"}
      description="Un botón de la página de enlaces. La vista previa lo muestra mientras lo editas."
      error={error}
      isSaving={isSaving}
      canSave={!isUploadingImage}
      hasChanges={current !== opened}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
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
          onChange={(event) => {
            hrefRevision.current += 1;
            setHref(event.target.value);
          }}
          onBlur={() => {
            if (!thumbnailChosen.current && !imageUrl) {
              void takeLinkImage({ quiet: true });
            }
          }}
          placeholder="https://… , /store o un correo"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <p className="text-xs text-muted-foreground">
          Una dirección web, una ruta de este sitio (empieza con /) o un correo.
        </p>
      </div>
      <ThumbnailField
        mode={mode}
        onModeChange={(next) => {
          chooseThumbnail();
          setMode(next);
        }}
        icon={icon}
        iconSvg={iconSvg}
        onIconChange={(next, nextSvg) => {
          chooseThumbnail();
          setIcon(next);
          setIconSvg(nextSvg);
        }}
        imageUrl={imageUrl}
        onImageChange={(next) => {
          chooseThumbnail();
          setImageUrl(next);
        }}
        canUseLinkImage={isWebLink}
        isFetchingLinkImage={isFetchingImage}
        onUseLinkImage={() => {
          chooseThumbnail();
          void takeLinkImage({ quiet: false });
        }}
        onUploadingChange={setIsUploadingImage}
      />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Diseño del botón</legend>
        <div
          role="radiogroup"
          aria-label="Diseño del botón"
          className="grid grid-cols-2 gap-2"
        >
          {SITE_LINK_LAYOUTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={layout === value}
              onClick={() => setLayout(value)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-border p-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                layout === value &&
                  "border-primary bg-primary/10 font-medium text-primary hover:text-primary",
              )}
            >
              {/* A sketch of each card: a row, or an image over a line. */}
              {value === "featured" ? (
                <span aria-hidden className="flex w-12 flex-col gap-1">
                  <span className="h-5 rounded-sm bg-current opacity-40" />
                  <span className="mx-auto h-1 w-6 rounded-full bg-current opacity-40" />
                </span>
              ) : (
                <span aria-hidden className="flex w-12 items-center gap-1">
                  <span className="size-3 rounded-sm bg-current opacity-40" />
                  <span className="h-1 flex-1 rounded-full bg-current opacity-40" />
                </span>
              )}
              {SITE_LINK_LAYOUT_LABELS[value]}
            </button>
          ))}
        </div>
        {layout === "featured" ? (
          <p className="text-xs text-muted-foreground">
            {mode === "none"
              ? "Sin miniatura no hay nada que destacar: el enlace se muestra con el diseño clásico."
              : mode === "image"
                ? "Muestra la imagen del enlace en grande, con el título debajo."
                : "Muestra el ícono en grande, con el título debajo. Con una imagen se luce más."}
          </p>
        ) : null}
      </fieldset>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Label htmlFor="site-link-scheduled" className="min-w-0">
            <span className="block text-sm font-medium">Programar</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Mostrarlo solo desde una fecha, hasta otra, o entre las dos.
            </span>
          </Label>
          <Switch
            id="site-link-scheduled"
            checked={scheduled}
            onCheckedChange={setScheduled}
          />
        </div>
        {scheduled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="site-link-from">Mostrar desde</Label>
                <Input
                  id="site-link-from"
                  type="datetime-local"
                  value={visibleFrom}
                  max={visibleUntil || undefined}
                  onChange={(event) => setVisibleFrom(event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="site-link-until">Mostrar hasta</Label>
                <Input
                  id="site-link-until"
                  type="datetime-local"
                  value={visibleUntil}
                  min={visibleFrom || undefined}
                  onChange={(event) => setVisibleUntil(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Hora de Bolivia. Deja vacía la fecha que no necesites.
            </p>
          </>
        ) : null}
      </div>
    </EditorScreen>
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
  // What leaving without saving would lose.
  const current = JSON.stringify({ network, value });
  const [opened] = useState(current);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!network) return;
    setError(null);
    startSaving(async () => {
      const res = await attempt(() =>
        existing
          ? updateSocialLink(existing.id, value)
          : createSocialLink({ network, value }),
      );
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success(existing ? "Ícono actualizado" : "Ícono agregado");
      onSaved();
    });
  }

  return (
    <EditorScreen
      title={
        existingNetwork
          ? `Editar ícono de ${SITE_LINK_ICON_LABELS[existingNetwork]}`
          : "Nuevo ícono social"
      }
      description="Se muestra como un ícono bajo la descripción, sin título."
      error={error}
      isSaving={isSaving}
      canSave={network != null}
      hasChanges={current !== opened}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
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
    </EditorScreen>
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
function SocialPositionPicker({
  position,
  onPositionChange,
}: {
  /** As shown, which is ahead of what is saved while a change is sent. */
  position: SocialPosition;
  onPositionChange: (position: SocialPosition) => void;
}) {
  const router = useRouter();
  const setPosition = onPositionChange;
  const [isPending, startTransition] = useTransition();

  function choose(next: SocialPosition) {
    if (next === position) return;
    const previous = position;
    setPosition(next);
    startTransition(async () => {
      const res = await attempt(() => setSocialPosition(next));
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
  now,
  items,
  onItemsChange: setItems,
  canAdd = true,
  onAdd,
  onEdit,
  children,
}: {
  /** Shown under the rows: settings that belong to this kind alone. */
  children?: React.ReactNode;
  kind: SiteLinkKind;
  now: Date;
  /** The rows as shown, ahead of what is saved while a change is sent. */
  items: SiteLinkRow[];
  onItemsChange: React.Dispatch<React.SetStateAction<SiteLinkRow[]>>;
  /** False once there is nothing left to add (every network has its icon). */
  canAdd?: boolean;
  onAdd: () => void;
  onEdit: (link: SiteLinkRow) => void;
}) {
  const router = useRouter();
  const copy = SECTION_COPY[kind];
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<SiteLinkRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // One change at a time: a second reorder's undo would restore the
    // first's unsaved order.
    if (isPending) return;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    startTransition(async () => {
      const res = await attempt(() =>
        reorderSiteLinks(
          kind,
          next.map((item) => item.id),
        ),
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
    // Shown at once, in the row and in the preview; undone if it is refused.
    const show = (visible: boolean) =>
      setItems((prev) =>
        prev.map((item) =>
          item.id === link.id ? { ...item, isVisible: visible } : item,
        ),
      );
    show(isVisible);
    startTransition(async () => {
      const res = await attempt(() => setSiteLinkVisible(link.id, isVisible));
      if (!res.success) {
        toast.error(res.message);
        show(!isVisible);
        return;
      }
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const { id } = deleting;
    startTransition(async () => {
      const res = await attempt(() => deleteSiteLink(id));
      setDeleting(null);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(copy.deleted);
      setItems((prev) => prev.filter((item) => item.id !== id));
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
        // A fixed id: dnd-kit's own counter differs between the server and
        // the browser, and React reports the mismatch on hydration.
        id={`links-dnd-${kind}`}
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
                  now={now}
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

const headerUploadAppearance =
  "!h-10 !w-auto !rounded-md !border !border-input !bg-background !px-4 !text-sm !font-medium !text-foreground hover:!bg-accent hover:!text-accent-foreground after:!bg-primary/40";

/**
 * The page's picture, name and line. The fields are the header as shown,
 * which the preview follows as it is typed; saving is its own button.
 */
function HeaderSection({
  saved,
  header,
  onHeaderChange,
}: {
  /** What the page has now. */
  saved: LinksHeader;
  /** What the fields hold. */
  header: LinksHeader;
  onHeaderChange: (header: LinksHeader) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  // A save now would refresh the saved header over the picture still on its
  // way: it waits for the upload.
  const [isUploading, setIsUploading] = useState(false);
  const changed =
    header.title !== saved.title ||
    header.description !== saved.description ||
    header.avatarUrl !== saved.avatarUrl;
  const isStock =
    header.title === DEFAULT_LINKS_HEADER.title &&
    header.description === DEFAULT_LINKS_HEADER.description &&
    header.avatarUrl == null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isUploading) return;
    setError(null);
    startSaving(async () => {
      const res = await attempt(() => updateLinksHeader(header));
      if (!res.success) {
        setError(res.message);
        return;
      }
      toast.success("Encabezado actualizado");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="links-section-header">
      <div className="min-w-0">
        <h2 id="links-section-header" className="text-lg font-semibold">
          Encabezado
        </h2>
        <p className="text-sm text-muted-foreground">
          La imagen, el nombre y la descripción que abren la página.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="min-w-0">
        {/* Held still while a save is on its way: its refresh would put the
            saved header back over an edit made meanwhile. */}
        <fieldset
          disabled={isSaving}
          className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-3"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {header.avatarUrl ? (
              <Image
                src={header.avatarUrl}
                alt="Imagen del encabezado"
                width={128}
                height={128}
                className="size-16 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <GlitterLogo
                variant="dark"
                height={64}
                width={64}
                className="shrink-0 rounded-full"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton
                endpoint="siteLinkImage"
                content={{
                  button({ ready, isUploading, uploadProgress }) {
                    if (isUploading) return `${uploadProgress}%`;
                    if (!ready) return "Cargando…";
                    return header.avatarUrl ? "Cambiar imagen" : "Subir imagen";
                  },
                  allowedContent: () => null,
                }}
                appearance={{
                  button: headerUploadAppearance,
                  container: "w-fit",
                  allowedContent: "hidden",
                }}
                onUploadBegin={() => setIsUploading(true)}
                onClientUploadComplete={(files) => {
                  setIsUploading(false);
                  const avatarUrl = files?.[0]?.serverData?.imageUrl;
                  if (!avatarUrl) {
                    toast.error("Error al subir la imagen");
                    return;
                  }
                  onHeaderChange({ ...header, avatarUrl });
                }}
                onUploadError={() => {
                  setIsUploading(false);
                  toast.error("Error al subir la imagen");
                }}
              />
              {header.avatarUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => onHeaderChange({ ...header, avatarUrl: null })}
                >
                  Usar el logo
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="links-header-title">Nombre</Label>
            <Input
              id="links-header-title"
              value={header.title}
              maxLength={LINKS_TITLE_MAX}
              onChange={(event) =>
                onHeaderChange({ ...header, title: event.target.value })
              }
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="links-header-description">Descripción</Label>
            <Textarea
              id="links-header-description"
              value={header.description}
              maxLength={LINKS_DESCRIPTION_MAX}
              rows={2}
              onChange={(event) =>
                onHeaderChange({ ...header, description: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              {header.description.length}/{LINKS_DESCRIPTION_MAX}. Déjala vacía
              para no mostrar ninguna.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={!changed || isSaving || isUploading}
            >
              {isSaving ? "Guardando…" : "Guardar encabezado"}
            </Button>
            {changed ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => {
                  setError(null);
                  onHeaderChange(saved);
                }}
              >
                Deshacer
              </Button>
            ) : null}
            {isStock ? null : (
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground"
                disabled={isSaving}
                onClick={() => onHeaderChange(DEFAULT_LINKS_HEADER)}
              >
                Volver al original
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}

/** Room for the editor and a phone-sized preview side by side. */
const WIDE_QUERY = "(min-width: 1280px)";

function subscribeToWide(onChange: () => void) {
  if (typeof matchMedia !== "function") return () => {};
  const media = matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useIsWide() {
  return useSyncExternalStore(
    subscribeToWide,
    () => typeof matchMedia === "function" && matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

const PREVIEW_HINT =
  "Así se ve la página con tus cambios. Los toques aquí no cuentan como clics.";

/**
 * What is shown of something the server holds: the server's value, until a
 * change is made here, and the server's again whenever a refresh brings a new
 * one. Lets the rows and the preview show a change before it is saved.
 */
function useShown<T>(saved: T) {
  const [shown, setShown] = useState(saved);
  const [synced, setSynced] = useState(saved);
  if (synced !== saved) {
    setSynced(saved);
    setShown(saved);
  }
  return [shown, setShown] as const;
}

export default function LinksManager({
  initialLinks,
  initialSocialPosition = "top",
  initialHeader = DEFAULT_LINKS_HEADER,
  now: readAt,
  publicUrl,
}: {
  initialLinks: SiteLinkRow[];
  initialSocialPosition?: SocialPosition;
  initialHeader?: LinksHeader;
  /**
   * When the page was read, in milliseconds: the instant every schedule on
   * it is judged at, the same on the server and in the browser.
   */
  now: number;
  publicUrl: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const isWide = useIsWide();

  // The same arrays until the server sends a new list: `useShown` takes a new
  // one for a refresh and drops what is shown ahead of it, so opening a form
  // (a render of this component alone) must not hand it one.
  const savedSocials = useMemo(
    () => initialLinks.filter((link) => link.kind === "social"),
    [initialLinks],
  );
  const savedLinks = useMemo(
    () => initialLinks.filter((link) => link.kind !== "social"),
    [initialLinks],
  );
  const [socials, setSocials] = useShown(savedSocials);
  const [links, setLinks] = useShown(savedLinks);
  const [socialPosition, setShownPosition] = useShown(initialSocialPosition);
  const [draft, setDraft] = useState<LinkDraft | null>(null);
  // The saved header as one object for as long as it says the same: every
  // refresh hands over a new object, and taking each for a new header would
  // throw away a name being typed or a picture just uploaded whenever
  // anything else on the page was saved.
  const { title, description, avatarUrl } = initialHeader;
  const savedHeader = useMemo(
    () => ({ title, description, avatarUrl }),
    [title, description, avatarUrl],
  );
  const [header, setHeader] = useShown(savedHeader);
  const now = useMemo(() => new Date(readAt), [readAt]);

  // What a visitor would get with everything on screen saved: the visible
  // rows in their order, and the open form's link as the form has it.
  const previewLinks = useMemo(() => {
    // The open form's link as the form has it, in place of the saved one or
    // after the last.
    const rows = [...socials, ...links];
    const all =
      draft == null
        ? rows
        : draft.id == null
          ? [...rows, { ...draft, id: -1, kind: "link", isVisible: true }]
          : rows.map((link) =>
              link.id === draft.id ? { ...link, ...draft, id: link.id } : link,
            );
    return all.filter((link) => link.isVisible && isWithinSchedule(link, now));
  }, [socials, links, draft, now]);
  const preview = (
    <LinksPageView
      preview
      links={previewLinks}
      socialPosition={socialPosition}
      header={{
        ...header,
        // A name being retyped is never a page with none.
        title: header.title.trim() || DEFAULT_LINKS_HEADER.title,
      }}
    />
  );

  const availableNetworks = SOCIAL_NETWORKS.filter(
    (network) => !socials.some((link) => link.icon === network),
  );

  // The editor takes the lists' place, so it opens at the top of the page
  // from wherever its row was, and closing it goes back to that row.
  const listScroll = useRef<number | null>(null);
  const openEditor = (next: NonNullable<Editing>) => {
    listScroll.current = window.scrollY;
    setEditing(next);
  };
  const isEditing = editing != null;
  useEffect(() => {
    if (isEditing) {
      window.scrollTo(0, 0);
      return;
    }
    const back = listScroll.current;
    if (back == null) return;
    listScroll.current = null;
    // Once the lists are back in the page, which is what makes it tall
    // enough to scroll that far.
    requestAnimationFrame(() => window.scrollTo(0, back));
  }, [isEditing]);

  const closeForm = () => {
    setEditing(null);
    setDraft(null);
  };
  /**
   * A save of `saved` finished. Closes the editor only if it is still the one
   * that save came from: an answer that arrives late must not close, or take
   * the draft of, an editor opened since.
   */
  const savedForm = (saved: NonNullable<Editing>) => {
    setEditing((current) => (current === saved ? null : current));
    // The draft stays until the refresh brings the saved link, so the
    // preview does not show the old one in between.
    router.refresh();
  };
  // With the saved list in, the draft has nothing left to add.
  const [draftFor, setDraftFor] = useState(initialLinks);
  if (draftFor !== initialLinks) {
    setDraftFor(initialLinks);
    if (!editing) setDraft(null);
  }
  // A fresh form for each row, never the last one's fields.
  const formKey = editing
    ? `${editing.kind}-${editing.target === "new" ? "new" : editing.target.id}`
    : undefined;

  return (
    // Room at the end of the list for the floating preview button.
    <div className="pb-20 xl:grid xl:grid-cols-[minmax(0,48rem)_20rem] xl:items-start xl:gap-10 xl:pb-0">
      <div className="min-w-0">
        {/* Kept in the page under the editor, out of sight: what each list
            shows ahead of a save, and where it was scrolled to, stay. */}
        <div className="space-y-8" hidden={editing != null}>
          <div className="space-y-3">
            {/* A path, not an address: it opens on whatever domain this is. */}
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              asChild
            >
              <a href={LINKS_PATH} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-2 size-4 shrink-0" />
                Ver página
              </a>
            </Button>
            <p className="text-sm text-muted-foreground wrap-anywhere">
              Dirección para la bio:{" "}
              <span className="font-medium">{publicUrl}</span>
            </p>
          </div>

          <HeaderSection
            saved={savedHeader}
            header={header}
            onHeaderChange={setHeader}
          />
          <LinksSection
            kind="social"
            now={now}
            items={socials}
            onItemsChange={setSocials}
            canAdd={availableNetworks.length > 0}
            onAdd={() => openEditor({ kind: "social", target: "new" })}
            onEdit={(link) => openEditor({ kind: "social", target: link })}
          >
            <SocialPositionPicker
              position={socialPosition}
              onPositionChange={setShownPosition}
            />
          </LinksSection>
          <LinksSection
            kind="link"
            now={now}
            items={links}
            onItemsChange={setLinks}
            onAdd={() => openEditor({ kind: "link", target: "new" })}
            onEdit={(link) => openEditor({ kind: "link", target: link })}
          />
        </div>

        {editing?.kind === "link" ? (
          <LinkFormDialog
            key={formKey}
            editing={editing.target}
            onClose={closeForm}
            onSaved={() => savedForm(editing)}
            onDraftChange={setDraft}
          />
        ) : null}
        {editing?.kind === "social" ? (
          <SocialFormDialog
            key={formKey}
            editing={editing.target}
            available={availableNetworks}
            onClose={closeForm}
            onSaved={() => savedForm(editing)}
          />
        ) : null}
      </div>
      {isWide ? null : (
        <Drawer>
          {/* Always in reach, however far down the list of links goes: fixed
              over the page, above the installed app's tab bar. */}
          <DrawerTrigger asChild>
            <Button
              type="button"
              size="lg"
              className="fixed right-4 bottom-app-chrome z-40 mb-[calc(1rem+var(--app-bottom-safe-area,env(safe-area-inset-bottom)))] rounded-full px-5 shadow-lg"
            >
              <EyeIcon className="mr-2 size-4 shrink-0" />
              Vista previa
            </Button>
          </DrawerTrigger>
          {/* The whole screen: the page is a screen tall itself. */}
          <DrawerContent className="data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-dvh data-[vaul-drawer-direction=bottom]:max-h-dvh pt-[env(safe-area-inset-top)]">
            <DrawerHeader className="relative px-12">
              <DrawerTitle>Vista previa</DrawerTitle>
              <DrawerDescription>{PREVIEW_HINT}</DrawerDescription>
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  aria-label="Cerrar vista previa"
                >
                  <XIcon className="size-5" />
                </Button>
              </DrawerClose>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {preview}
            </div>
          </DrawerContent>
        </Drawer>
      )}
      {isWide ? (
        <aside aria-label="Vista previa" className="sticky top-24 space-y-3">
          <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto rounded-[2rem] border-4 border-border bg-background shadow-lg [scrollbar-width:thin]">
            {/* A miniature of the page on a 390px phone, not the page at
                full size squeezed into the frame: the 312px the frame leaves
                are that phone at four fifths. */}
            <div className="[zoom:0.8]">{preview}</div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {PREVIEW_HINT}
          </p>
        </aside>
      ) : null}
    </div>
  );
}

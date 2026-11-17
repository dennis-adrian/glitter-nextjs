"use client";

import {
  ImageIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import SiteLinkIcon from "@/app/components/links/site-link-icon";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  ICON_LIBRARY_LABELS,
  SITE_LINK_ICONS,
  SITE_LINK_ICON_LABELS,
  THUMBNAIL_MODES,
  THUMBNAIL_MODE_LABELS,
  isFeaturedIcon,
  isSafeIconSvg,
  parseLibraryIcon,
  type IconLibrarySet,
  type ThumbnailMode,
} from "@/app/lib/links/definitions";
import { cn } from "@/app/lib/utils";
import { UploadButton } from "@/app/vendors/uploadthing";

type LibraryIcon = {
  ref: string;
  set: IconLibrarySet;
  name: string;
  label: string;
  /** Its drawing, built by the server from the libraries' own data. */
  svg: string;
};

const ICON_BUTTON_CLASS =
  "flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ICON_BUTTON_PICKED_CLASS =
  "border-primary bg-primary/10 text-primary hover:text-primary";

/**
 * A library icon from its drawing. The markup comes from our own server
 * (`libraryIconSvg`), which builds it from the icon libraries' data and from
 * nothing a person typed.
 */
function LibraryIconDrawing({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  // Put in the page as markup only if it is a plain drawing.
  if (!isSafeIconSvg(svg)) return null;
  return (
    <span
      aria-hidden
      className={cn("inline-flex [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** What the picker calls a library icon it has no label for. */
function libraryIconName(iconRef: string) {
  const parsed = parseLibraryIcon(iconRef);
  return parsed ? parsed.name.replaceAll("-", " ") : iconRef;
}

type IconPage = { icons: LibraryIcon[]; total: number };

async function fetchIconPage(
  query: string,
  offset: number,
  signal: AbortSignal,
): Promise<IconPage> {
  const params = new URLSearchParams({ q: query, offset: String(offset) });
  const response = await fetch(`/api/links/icons?${params}`, { signal });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as IconPage;
}

/**
 * Every Lucide and Simple Icons icon, a page at a time as the list is
 * scrolled, with the featured ones first. Typing filters the list to the
 * icons the search finds, and leaves the featured ones out. The names are the
 * libraries' own, in English.
 */
function IconPicker({
  value,
  valueSvg,
  onChange,
}: {
  value: string;
  /** The drawing of `value` when it is a library icon. */
  valueSvg: string | null;
  onChange: (icon: string, svg: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  // The list belongs to one search: `listFor` is the search it was asked for.
  const [list, setList] = useState<IconPage & { listFor: string }>({
    icons: [],
    total: 0,
    listFor: "",
  });
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const loadingMore = useRef(false);
  // Counts the searches started. A page asked for under one search is not
  // added to the list of a later one, even a later one for the same words.
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    loadingMore.current = false;
    // At once when the picker opens; after a pause while typing.
    const timer = setTimeout(
      async () => {
        setStatus("loading");
        try {
          const page = await fetchIconPage(trimmed, 0, controller.signal);
          setList({ ...page, listFor: trimmed });
          setStatus("idle");
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error("icon list", error);
          setStatus("error");
        }
      },
      trimmed ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const icons = list.listFor === trimmed ? list.icons : [];
  const hasMore = list.listFor === trimmed && icons.length < list.total;

  async function loadMore() {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    const asked = generation.current;
    try {
      const page = await fetchIconPage(
        trimmed,
        icons.length,
        new AbortController().signal,
      );
      // A search started meanwhile has its own list.
      if (generation.current !== asked) return;
      setList((current) =>
        current.listFor === trimmed
          ? {
              ...current,
              total: page.total,
              icons: [
                ...current.icons,
                ...page.icons.filter(
                  (icon) => !current.icons.some((had) => had.ref === icon.ref),
                ),
              ],
            }
          : current,
      );
    } catch (error) {
      console.error("icon list", error);
    } finally {
      if (generation.current === asked) loadingMore.current = false;
    }
  }

  const pickedFromLibrary = parseLibraryIcon(value) != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar: cámara, música, spotify…"
          aria-label="Buscar íconos"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="pl-9"
        />
      </div>

      {pickedFromLibrary && valueSvg ? (
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className={cn(ICON_BUTTON_CLASS, ICON_BUTTON_PICKED_CLASS)}>
            <LibraryIconDrawing svg={valueSvg} className="size-5" />
          </span>
          <span className="min-w-0 break-words">
            Elegido: {libraryIconName(value)}
          </span>
        </p>
      ) : null}

      <div
        className="flex max-h-60 flex-col gap-3 overflow-y-auto rounded-md border border-border p-2"
        onScroll={(event) => {
          const box = event.currentTarget;
          if (box.scrollTop + box.clientHeight >= box.scrollHeight - 120) {
            void loadMore();
          }
        }}
      >
        {trimmed ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Destacados</p>
            <div className="flex flex-wrap gap-2">
              {SITE_LINK_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={value === name}
                  aria-label={SITE_LINK_ICON_LABELS[name]}
                  title={SITE_LINK_ICON_LABELS[name]}
                  onClick={() => onChange(name, null)}
                  className={cn(
                    ICON_BUTTON_CLASS,
                    value === name && ICON_BUTTON_PICKED_CLASS,
                  )}
                >
                  <SiteLinkIcon icon={name} className="size-5" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {status === "error"
              ? "No se pudieron cargar los íconos. Inténtalo de nuevo."
              : status === "loading" && icons.length === 0
                ? "Cargando…"
                : trimmed
                  ? icons.length === 0
                    ? "Sin resultados. Prueba con otra palabra, o en inglés."
                    : `Resultados (${list.total})`
                  : "Todos los íconos"}
          </p>
          {icons.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {icons.map((icon) => (
                <button
                  key={icon.ref}
                  type="button"
                  aria-pressed={value === icon.ref}
                  aria-label={`${icon.label} (${ICON_LIBRARY_LABELS[icon.set]})`}
                  title={`${icon.label} · ${ICON_LIBRARY_LABELS[icon.set]}`}
                  onClick={() => onChange(icon.ref, icon.svg)}
                  className={cn(
                    ICON_BUTTON_CLASS,
                    value === icon.ref && ICON_BUTTON_PICKED_CLASS,
                  )}
                >
                  <LibraryIconDrawing svg={icon.svg} className="size-5" />
                </button>
              ))}
            </div>
          ) : null}
          {hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => void loadMore()}
            >
              Cargar más
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const uploadButtonAppearance =
  "!h-10 !w-auto !rounded-md !border !border-input !bg-background !px-4 !text-sm !font-medium !text-foreground hover:!bg-accent hover:!text-accent-foreground after:!bg-primary/40";

function ImagePicker({
  value,
  onChange,
  canUseLinkImage,
  isFetchingLinkImage,
  onUseLinkImage,
  onUploadingChange,
}: {
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  /** False until the link is a web address, the only kind with an image. */
  canUseLinkImage: boolean;
  isFetchingLinkImage: boolean;
  onUseLinkImage: () => void;
  onUploadingChange: (isUploading: boolean) => void;
}) {
  // Leaving the image choice mid-upload drops its answer: not uploading.
  useEffect(() => () => onUploadingChange(false), [onUploadingChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {value ? (
          <Image
            src={value}
            alt="Miniatura del enlace"
            width={112}
            height={112}
            className="size-14 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-muted/30">
            <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
          </span>
        )}
        <p className="min-w-0 text-xs text-muted-foreground">
          {value
            ? "Se muestra junto al título, en lugar del ícono."
            : "Usa la imagen que el enlace tiene para compartir, o sube una. JPG, PNG o WebP, máximo 4 MB."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          wrap
          disabled={!canUseLinkImage || isFetchingLinkImage}
          onClick={onUseLinkImage}
        >
          {isFetchingLinkImage ? (
            <Loader2Icon aria-hidden className="mr-2 size-4 animate-spin" />
          ) : (
            <WandSparklesIcon aria-hidden className="mr-2 size-4 shrink-0" />
          )}
          {isFetchingLinkImage ? "Buscando imagen…" : "Usar la del enlace"}
        </Button>
        <UploadButton
          endpoint="siteLinkImage"
          content={{
            button({ ready, isUploading, uploadProgress }) {
              if (isUploading) {
                return (
                  <span className="flex items-center gap-2">
                    <Loader2Icon aria-hidden className="size-4 animate-spin" />
                    {uploadProgress}%
                  </span>
                );
              }
              if (!ready) return "Cargando…";
              return (
                <span className="flex items-center gap-2">
                  <UploadIcon aria-hidden className="size-4" />
                  {value ? "Reemplazar" : "Subir imagen"}
                </span>
              );
            },
            allowedContent: () => null,
          }}
          appearance={{
            button: uploadButtonAppearance,
            container: "w-fit",
            allowedContent: "hidden",
          }}
          onUploadBegin={() => onUploadingChange(true)}
          onClientUploadComplete={(files) => {
            onUploadingChange(false);
            const imageUrl = files?.[0]?.serverData?.imageUrl;
            if (!imageUrl) {
              toast.error("Error al subir la imagen");
              return;
            }
            onChange(imageUrl);
          }}
          onUploadError={() => {
            onUploadingChange(false);
            toast.error("Error al subir la imagen");
          }}
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onChange(null)}
          >
            <Trash2Icon aria-hidden className="mr-1 size-4" />
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What a link shows beside its title: an image, an icon or nothing. The three
 * are kept apart, so going from one to another and back loses nothing.
 */
export default function ThumbnailField({
  mode,
  onModeChange,
  icon,
  iconSvg,
  onIconChange,
  imageUrl,
  onImageChange,
  canUseLinkImage,
  isFetchingLinkImage,
  onUseLinkImage,
  onUploadingChange,
}: {
  mode: ThumbnailMode;
  onModeChange: (mode: ThumbnailMode) => void;
  /** A featured icon or one of the library's; never `none`. */
  icon: string;
  /** The drawing of `icon` when it is one of the library's. */
  iconSvg: string | null;
  onIconChange: (icon: string, svg: string | null) => void;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  canUseLinkImage: boolean;
  isFetchingLinkImage: boolean;
  onUseLinkImage: () => void;
  /** Told when an upload starts and ends, so a save can wait for it. */
  onUploadingChange: (isUploading: boolean) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Miniatura</legend>
      <div
        role="radiogroup"
        aria-label="Tipo de miniatura"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {THUMBNAIL_MODES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onModeChange(value)}
            className={cn(
              "min-h-9 rounded-md px-2 text-sm text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              mode === value &&
                "bg-background font-medium text-foreground shadow-xs",
            )}
          >
            {THUMBNAIL_MODE_LABELS[value]}
          </button>
        ))}
      </div>

      {mode === "image" ? (
        <ImagePicker
          value={imageUrl}
          onChange={onImageChange}
          canUseLinkImage={canUseLinkImage}
          isFetchingLinkImage={isFetchingLinkImage}
          onUseLinkImage={onUseLinkImage}
          onUploadingChange={onUploadingChange}
        />
      ) : null}
      {mode === "icon" ? (
        <IconPicker
          value={isFeaturedIcon(icon) || parseLibraryIcon(icon) ? icon : "link"}
          valueSvg={iconSvg}
          onChange={onIconChange}
        />
      ) : null}
      {mode === "none" ? (
        <p className="text-xs text-muted-foreground">
          El enlace se muestra solo con su título.
        </p>
      ) : null}
    </fieldset>
  );
}

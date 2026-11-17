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
import { useEffect, useState } from "react";
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
  libraryIconUrl,
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
};

const ICON_BUTTON_CLASS =
  "flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const ICON_BUTTON_PICKED_CLASS =
  "border-primary bg-primary/10 text-primary hover:text-primary";

/**
 * A library icon, drawn in the current colour from its file: the file is the
 * mask and the colour fills it. Keeps the two libraries out of the browser.
 */
export function LibraryIconImage({
  iconRef,
  className,
}: {
  iconRef: string;
  className?: string;
}) {
  const parsed = parseLibraryIcon(iconRef);
  if (!parsed) return null;
  const url = `url("${libraryIconUrl(parsed.set, parsed.name)}")`;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]",
        className,
      )}
      style={{ maskImage: url, WebkitMaskImage: url }}
    />
  );
}

/** What the picker calls an icon of a library before its results arrive. */
function libraryIconName(iconRef: string) {
  const parsed = parseLibraryIcon(iconRef);
  return parsed ? parsed.name.replaceAll("-", " ") : iconRef;
}

/**
 * The featured icons first, then a search over every Lucide and Simple Icons
 * icon. The names are the libraries' own, in English.
 */
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryIcon[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `/api/links/icons?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { icons: LibraryIcon[] };
        setResults(data.icons);
        setStatus("idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("icon search", error);
        setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const shown = trimmed ? results : [];
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
          placeholder="Buscar: camera, music, spotify…"
          aria-label="Buscar íconos"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="pl-9"
        />
      </div>

      {pickedFromLibrary ? (
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className={cn(ICON_BUTTON_CLASS, ICON_BUTTON_PICKED_CLASS)}>
            <LibraryIconImage iconRef={value} className="size-5" />
          </span>
          <span className="min-w-0 break-words">
            Elegido: {libraryIconName(value)}
          </span>
        </p>
      ) : null}

      {trimmed ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {status === "loading"
              ? "Buscando…"
              : status === "error"
                ? "No se pudo buscar. Inténtalo de nuevo."
                : shown.length === 0
                  ? "Sin resultados. Los nombres están en inglés."
                  : "Resultados"}
          </p>
          {shown.length > 0 ? (
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto p-0.5">
              {shown.map((icon) => (
                <button
                  key={icon.ref}
                  type="button"
                  aria-pressed={value === icon.ref}
                  aria-label={`${icon.label} (${ICON_LIBRARY_LABELS[icon.set]})`}
                  title={`${icon.label} · ${ICON_LIBRARY_LABELS[icon.set]}`}
                  onClick={() => onChange(icon.ref)}
                  className={cn(
                    ICON_BUTTON_CLASS,
                    value === icon.ref && ICON_BUTTON_PICKED_CLASS,
                  )}
                >
                  <LibraryIconImage iconRef={icon.ref} className="size-5" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
              onClick={() => onChange(name)}
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
}: {
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  /** False until the link is a web address, the only kind with an image. */
  canUseLinkImage: boolean;
  isFetchingLinkImage: boolean;
  onUseLinkImage: () => void;
}) {
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
          onClientUploadComplete={(files) => {
            const imageUrl = files?.[0]?.serverData?.imageUrl;
            if (!imageUrl) {
              toast.error("Error al subir la imagen");
              return;
            }
            onChange(imageUrl);
          }}
          onUploadError={() => {
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
  onIconChange,
  imageUrl,
  onImageChange,
  canUseLinkImage,
  isFetchingLinkImage,
  onUseLinkImage,
}: {
  mode: ThumbnailMode;
  onModeChange: (mode: ThumbnailMode) => void;
  /** A featured icon or one of the library's; never `none`. */
  icon: string;
  onIconChange: (icon: string) => void;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  canUseLinkImage: boolean;
  isFetchingLinkImage: boolean;
  onUseLinkImage: () => void;
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
        />
      ) : null}
      {mode === "icon" ? (
        <IconPicker
          value={isFeaturedIcon(icon) || parseLibraryIcon(icon) ? icon : "link"}
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

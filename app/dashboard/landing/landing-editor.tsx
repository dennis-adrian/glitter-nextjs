"use client";
/* eslint-disable @next/next/no-img-element */

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  ArrowDownIcon,
  ArrowUpIcon,
  CropIcon,
  CrosshairIcon,
  DownloadIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useForm,
  useWatch,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/app/components/ui/accordion";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import {
  publishLandingPageDraft,
  restoreLandingPublicationToDraft,
  saveLandingPageDraft,
} from "@/app/lib/landing_content/actions";
import {
  type ImageContent,
  type LandingPageContentV1,
  type LandingSectionBackground,
  type LandingSectionKey,
} from "@/app/lib/landing_content/definitions";
import {
  CENTERED_IMAGE_FOCAL_POINT,
  DEFAULT_IMAGE_ZOOM,
  getCommunityGalleryLayout,
  getImageObjectPosition,
  getImageZoom,
} from "@/app/lib/landing_content/gallery-layout";
import { parseLandingPageContent } from "@/app/lib/landing_content/schema";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Props = {
  initialContent: LandingPageContentV1;
  initialVersion: number;
  updatedAt: string | null;
  publication: {
    id: number;
    sourceDraftVersion: number;
    publishedAt: string;
  } | null;
  history: Array<{
    id: number;
    sourceDraftVersion: number;
    publishedAt: string;
    publishedByUserId: number | null;
  }>;
  festivals: Array<{
    id: number;
    name: string;
    status: "draft" | "published" | "active" | "archived";
    festivalType: "glitter" | "twinkler" | "festicker";
  }>;
  canPublish: boolean;
};

const sectionLabels: Record<LandingSectionKey, string> = {
  marketing_banners: "Carrusel de inicio",
  event_spotlight: "Próximo evento",
  audience: "Cómo participar",
  festival_family: "Familia de festivales",
  community: "Comunidad",
  partners: "Aliados",
};

const landingSectionTargets = [
  { href: "#inicio", label: "Portada" },
  { href: "#proximo-evento", label: "Próximo evento" },
  { href: "#participa", label: "Cómo participar" },
  { href: "#festivales", label: "Festivales" },
  { href: "#comunidad", label: "Comunidad" },
  { href: "#alianzas", label: "Alianzas y patrocinio" },
] as const;

const path = (...parts: Array<string | number>) => parts.join(".");
type FocalPoint = NonNullable<ImageContent["focalPoint"]>;

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value));
const MIN_IMAGE_ZOOM = 1;
const MAX_IMAGE_ZOOM = 3;
const IMAGE_ZOOM_STEP = 0.05;
const roundedFocalPoint = (point: FocalPoint): FocalPoint => ({
  x: Math.round(point.x * 10) / 10,
  y: Math.round(point.y * 10) / 10,
});

function Field({
  label,
  name,
  register,
  multiline = false,
  description,
}: {
  label: string;
  name: string;
  register: UseFormRegister<LandingPageContentV1>;
  multiline?: boolean;
  description?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {multiline ? (
        <Textarea className="min-h-24" {...register(name as never)} />
      ) : (
        <Input {...register(name as never)} />
      )}
      {description ? (
        <span className="text-xs text-muted-foreground">{description}</span>
      ) : null}
    </label>
  );
}

function SectionLinkPicker({
  href,
  name,
  setValue,
}: {
  href: string | null;
  name: string;
  setValue: UseFormSetValue<LandingPageContentV1>;
}) {
  const selectedHref = landingSectionTargets.some(
    (target) => target.href === href,
  )
    ? href
    : "";

  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">Enlazar a una sección</span>
      <select
        className="h-10 rounded-md border bg-background px-3"
        value={selectedHref}
        onChange={(event) => {
          if (!event.target.value) return;
          setValue(name as never, event.target.value as never, {
            shouldDirty: true,
          });
        }}
      >
        <option value="">Elegí una sección de inicio</option>
        {landingSectionTargets.map((target) => (
          <option key={target.href} value={target.href}>
            {target.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        Elegir una sección completa el enlace. También podés escribir una ruta o
        URL en el campo de arriba.
      </span>
    </label>
  );
}

function CropPreview({
  label,
  url,
  fit,
  frameClassName,
  focalPoint,
  zoom,
  onChange,
}: {
  label: string;
  url: string;
  fit: "cover" | "contain";
  frameClassName: string;
  focalPoint?: FocalPoint;
  zoom?: number;
  onChange: (point: FocalPoint) => void;
}) {
  const [draftPoint, setDraftPoint] = useState<FocalPoint>(
    focalPoint ?? { ...CENTERED_IMAGE_FOCAL_POINT },
  );
  const drag = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    focalPoint: FocalPoint;
    currentPoint: FocalPoint;
  } | null>(null);

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !url) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      focalPoint: draftPoint,
      currentPoint: draftPoint,
    };
  }

  function pan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      x: clampPercentage(
        active.focalPoint.x -
          ((event.clientX - active.originX) / rect.width) * 100,
      ),
      y: clampPercentage(
        active.focalPoint.y -
          ((event.clientY - active.originY) / rect.height) * 100,
      ),
    };
    active.currentPoint = next;
    setDraftPoint(next);
  }

  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = roundedFocalPoint(active.currentPoint);
    if (next.x !== active.focalPoint.x || next.y !== active.focalPoint.y) {
      onChange(next);
    }
  }

  function nudge(event: ReactKeyboardEvent<HTMLDivElement>) {
    const delta = event.shiftKey ? 10 : 2;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = roundedFocalPoint({
      x: clampPercentage(draftPoint.x + offset[0]),
      y: clampPercentage(draftPoint.y + offset[1]),
    });
    setDraftPoint(next);
    onChange(next);
  }

  function center() {
    if (
      draftPoint.x === CENTERED_IMAGE_FOCAL_POINT.x &&
      draftPoint.y === CENTERED_IMAGE_FOCAL_POINT.y
    ) {
      return;
    }
    const point = { ...CENTERED_IMAGE_FOCAL_POINT };
    setDraftPoint(point);
    onChange(point);
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Ajustar encuadre de ${label}. Arrastrá la foto o usá las flechas.`}
      className={`group/crop relative touch-none select-none overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${url ? "cursor-grab active:cursor-grabbing" : ""} ${frameClassName}`}
      onPointerDown={startPan}
      onPointerMove={pan}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
      onKeyDown={nudge}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className={`pointer-events-none size-full transition-transform duration-150 ${fit === "contain" ? "object-contain" : "object-cover"}`}
          style={{
            objectPosition: getImageObjectPosition(draftPoint),
            transform: `scale(${getImageZoom(zoom)})`,
            transformOrigin: getImageObjectPosition(draftPoint),
          }}
        />
      ) : null}
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white opacity-90 shadow-sm transition-opacity group-focus-within/crop:opacity-100 group-hover/crop:opacity-100">
        Arrastrá para encuadrar
      </span>
      <span className="pointer-events-none absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-black/15 text-white shadow-sm">
        <CrosshairIcon className="size-4" />
      </span>
      <button
        type="button"
        className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-2.5 text-xs font-medium text-brand-ink shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={center}
      >
        <RotateCcwIcon className="size-3.5" />
        Centrar
      </button>
    </div>
  );
}

function CropEditor({
  label,
  url,
  fit,
  frameClassName,
  modalFrameClassName,
  focalPoint,
  zoom,
  onChange,
  onZoomChange,
}: {
  label: string;
  url: string;
  fit: "cover" | "contain";
  frameClassName: string;
  modalFrameClassName: string;
  focalPoint?: FocalPoint;
  zoom?: number;
  onChange: (point: FocalPoint) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const resolvedZoom = getImageZoom(zoom);
  function changeZoom(value: number) {
    const next =
      Math.round(
        Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, value)) * 100,
      ) / 100;
    if (next !== resolvedZoom) onZoomChange(next);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Editar encuadre de ${label}`}
          className={`group/thumbnail relative w-full self-start overflow-hidden rounded-lg bg-muted outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${frameClassName}`}
        >
          {url ? (
            <img
              src={url}
              alt=""
              draggable={false}
              className={`size-full transition-transform duration-200 ${fit === "contain" ? "object-contain" : "object-cover"}`}
              style={{
                objectPosition: getImageObjectPosition(focalPoint),
                transform: `scale(${resolvedZoom})`,
                transformOrigin: getImageObjectPosition(focalPoint),
              }}
            />
          ) : null}
          <span className="absolute bottom-1.5 right-1.5 inline-flex h-7 items-center gap-1 rounded-full bg-black/70 px-2 text-[11px] font-medium text-white shadow-sm">
            <CropIcon className="size-3.5" />
            Editar
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-5 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle>Ajustar encuadre de {label}</DialogTitle>
          <DialogDescription>
            Arrastrá la imagen dentro del marco. También podés usar las flechas;
            mantené Shift para moverla más rápido. Usá el control de zoom para
            acercar o alejar.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border bg-muted/30 p-3 sm:p-4">
          <CropPreview
            key={`${url}:${focalPoint?.x ?? 50}:${focalPoint?.y ?? 50}`}
            label={label}
            url={url}
            fit={fit}
            frameClassName={`mx-auto w-full ${modalFrameClassName} ${frameClassName}`}
            focalPoint={focalPoint}
            zoom={resolvedZoom}
            onChange={onChange}
          />
          <div className="mx-auto mt-4 flex max-w-xl items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={resolvedZoom <= MIN_IMAGE_ZOOM}
              aria-label="Alejar imagen"
              onClick={() => changeZoom(resolvedZoom - 0.1)}
            >
              <MinusIcon className="size-4" />
            </Button>
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div className="flex items-center justify-between gap-3 text-xs font-medium">
                <span>Zoom</span>
                <output>{Math.round(resolvedZoom * 100)}%</output>
              </div>
              <Slider
                aria-label="Zoom de la imagen"
                min={MIN_IMAGE_ZOOM}
                max={MAX_IMAGE_ZOOM}
                step={IMAGE_ZOOM_STEP}
                value={[resolvedZoom]}
                onValueChange={(values) =>
                  changeZoom(values[0] ?? DEFAULT_IMAGE_ZOOM)
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={resolvedZoom >= MAX_IMAGE_ZOOM}
              aria-label="Acercar imagen"
              onClick={() => changeZoom(resolvedZoom + 0.1)}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
        </div>
        <DialogFooter className="items-start sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-lg text-xs text-muted-foreground">
            El encuadre y el zoom se conservan en las vistas públicas.
          </p>
          <DialogClose asChild>
            <Button type="button">Listo</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageField({
  label,
  base,
  url,
  fit = "cover",
  frameClassName = "aspect-square",
  modalFrameClassName = "max-w-2xl",
  focalPoint,
  zoom,
  allowFocalPoint = false,
  help,
  register,
  setValue,
}: {
  label: string;
  base: string;
  url: string;
  fit?: "cover" | "contain";
  frameClassName?: string;
  modalFrameClassName?: string;
  focalPoint?: FocalPoint;
  zoom?: number;
  allowFocalPoint?: boolean;
  help?: string;
  register: UseFormRegister<LandingPageContentV1>;
  setValue: UseFormSetValue<LandingPageContentV1>;
}) {
  const { isUploading, startUpload } = useUploadThing(
    "landingPageImageUploader",
    {
      onUploadError: () => {
        toast.error("No se pudo subir la imagen.");
      },
    },
  );
  async function upload(file: File | undefined) {
    if (!file) return;
    const result = await startUpload([file]);
    if (!result?.[0]?.url) return;
    setValue(path(base, "url") as never, result[0].url as never, {
      shouldDirty: true,
    });
    if (allowFocalPoint) {
      setValue(
        path(base, "focalPoint") as never,
        { ...CENTERED_IMAGE_FOCAL_POINT } as never,
        { shouldDirty: true },
      );
      setValue(path(base, "zoom") as never, DEFAULT_IMAGE_ZOOM as never, {
        shouldDirty: true,
      });
    }
    toast.success("Imagen cargada.");
  }
  return (
    <fieldset
      className={
        allowFocalPoint
          ? "grid gap-3"
          : "grid gap-3 rounded-xl border bg-muted/20 p-3"
      }
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      <div
        className={
          allowFocalPoint
            ? "grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[112px_minmax(0,1fr)]"
            : "grid gap-3 sm:grid-cols-[88px_1fr]"
        }
      >
        {allowFocalPoint ? (
          <CropEditor
            label={label}
            url={url}
            fit={fit}
            frameClassName={frameClassName}
            modalFrameClassName={modalFrameClassName}
            focalPoint={focalPoint}
            zoom={zoom}
            onChange={(point) =>
              setValue(path(base, "focalPoint") as never, point as never, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onZoomChange={(nextZoom) =>
              setValue(path(base, "zoom") as never, nextZoom as never, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        ) : (
          <div
            className={
              "relative overflow-hidden rounded-lg bg-muted " + frameClassName
            }
          >
            {url ? (
              <img
                src={url}
                alt=""
                className={
                  "size-full " +
                  (fit === "contain" ? "object-contain" : "object-cover")
                }
              />
            ) : null}
          </div>
        )}
        <div className="grid gap-2">
          <Field label="URL" name={path(base, "url")} register={register} />
          <Field
            label="Texto alternativo"
            name={path(base, "alt")}
            register={register}
          />
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-primary">
            <ImagePlusIcon className="size-4" />
            {isUploading ? "Subiendo…" : "Subir imagen (máx. 4 MB)"}
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={isUploading}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  help?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5">
      <div>
        <Label>{label}</Label>
        {help ? (
          <p className="mt-1 text-xs text-muted-foreground">{help}</p>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SortableSection({
  section,
  enabled,
  onToggle,
  background,
  onBackgroundChange,
}: {
  section: LandingSectionKey;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  background: LandingSectionBackground;
  onBackgroundChange: (value: LandingSectionBackground) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="grid gap-3 rounded-lg border bg-background px-3 py-2.5"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-label={"Reordenar " + sectionLabels[section]}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-5" />
        </button>
        <span className="flex-1 text-sm font-medium">
          {sectionLabels[section]}
        </span>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <Label className="text-xs text-muted-foreground">Fondo</Label>
        <select
          aria-label={`Fondo de ${sectionLabels[section]}`}
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={background}
          onChange={(event) =>
            onBackgroundChange(event.target.value as LandingSectionBackground)
          }
        >
          <option value="default">Patrón automático</option>
          <option value="none">Neutro</option>
          <option value="purple">Lila</option>
          <option value="coral">Coral</option>
        </select>
        {background !== "default" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onBackgroundChange("default")}
          >
            Restablecer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RemoveButton({
  onClick,
  disabled = false,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={`min-w-24 px-5 ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2Icon className="mr-2 size-4" />
      Quitar
    </Button>
  );
}

export default function LandingEditor({
  initialContent,
  initialVersion,
  updatedAt: initialUpdatedAt,
  publication,
  history,
  festivals,
  canPublish,
}: Props) {
  const router = useRouter();
  const form = useForm<LandingPageContentV1>({ defaultValues: initialContent });
  const { register, setValue, getValues, handleSubmit, reset } = form;
  const importInputRef = useRef<HTMLInputElement>(null);
  const content = useWatch({ control: form.control }) as LandingPageContentV1;
  const [version, setVersion] = useState(initialVersion);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [savedContent, setSavedContent] = useState(
    JSON.stringify(initialContent),
  );
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = useMemo(
    () => JSON.stringify(content) !== savedContent,
    [content, savedContent],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setArray(name: string, value: unknown[]) {
    setValue(name as never, value as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  function removeAt(name: string, index: number) {
    const values = getValues(name as never) as unknown as unknown[];
    setArray(
      name,
      values.filter((_, itemIndex) => itemIndex !== index),
    );
  }
  function addTo(name: string, value: unknown) {
    const values = getValues(name as never) as unknown as unknown[];
    setArray(name, [...values, value]);
  }

  function moveAt(name: string, from: number, to: number) {
    const values = getValues(name as never) as unknown as unknown[];
    setArray(name, arrayMove(values, from, to));
  }
  function exportContent() {
    const blob = new Blob([JSON.stringify(getValues(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `glitter-inicio-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importContent(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseLandingPageContent(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("El archivo no es válido.");
      if (
        !window.confirm(
          "Importar reemplazará los cambios actuales del formulario. ¿Continuar?",
        )
      )
        return;
      reset(parsed.data);
      toast.success(
        "Configuración importada. Guardá el borrador para aplicarla.",
      );
    } catch {
      toast.error("No se pudo importar ese archivo JSON.");
    }
  }
  function setEnabled(section: LandingSectionKey, enabled: boolean) {
    const field =
      section === "marketing_banners"
        ? "sections.marketingBanners.enabled"
        : section === "event_spotlight"
          ? "sections.eventSpotlight.enabled"
          : section === "audience"
            ? "sections.audience.enabled"
            : section === "festival_family"
              ? "sections.festivalFamily.enabled"
              : section === "community"
                ? "sections.community.enabled"
                : "sections.partners.enabled";
    setValue(field as never, enabled as never, { shouldDirty: true });
  }
  function setSectionBackground(
    section: LandingSectionKey,
    background: LandingSectionBackground,
  ) {
    setValue(`sectionBackgrounds.${section}`, background, {
      shouldDirty: true,
    });
  }
  function sectionEnabled(section: LandingSectionKey) {
    return section === "marketing_banners"
      ? content.sections.marketingBanners.enabled
      : section === "event_spotlight"
        ? content.sections.eventSpotlight.enabled
        : section === "audience"
          ? content.sections.audience.enabled
          : section === "festival_family"
            ? content.sections.festivalFamily.enabled
            : section === "community"
              ? content.sections.community.enabled
              : content.sections.partners.enabled;
  }
  function onSectionDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const current = getValues("sectionOrder");
    const from = current.indexOf(event.active.id as LandingSectionKey);
    const to = current.indexOf(event.over.id as LandingSectionKey);
    if (from >= 0 && to >= 0)
      setValue("sectionOrder", arrayMove(current, from, to), {
        shouldDirty: true,
      });
  }
  function openPreview() {
    window.open("/?preview=landing-draft", "_blank", "noopener,noreferrer");
  }
  function save(preview = false) {
    return handleSubmit((values) =>
      startTransition(async () => {
        const result = await saveLandingPageDraft({
          content: values,
          expectedVersion: version,
        });
        if (!result.ok) {
          toast.error(result.message, {
            action:
              "conflict" in result && result.conflict
                ? { label: "Recargar", onClick: () => router.refresh() }
                : undefined,
          });
          return;
        }
        setVersion(result.version);
        setUpdatedAt(result.updatedAt.toISOString());
        setSavedContent(JSON.stringify(values));
        toast.success("Borrador guardado.");
        if (preview) openPreview();
      }),
    )();
  }
  function preview() {
    if (dirty) {
      save(true);
      return;
    }
    openPreview();
  }
  function publish() {
    startTransition(async () => {
      if (dirty) {
        toast.error("Guardá el borrador antes de publicar.");
        return;
      }
      const result = await publishLandingPageDraft({
        expectedVersion: version,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Publicación #" + result.publicationId + " creada.");
      router.refresh();
    });
  }
  function restore(publicationId: number) {
    startTransition(async () => {
      if (dirty) {
        toast.error("Guardá o descartá los cambios antes de restaurar.");
        return;
      }
      if (!window.confirm("Esto reemplazará el borrador actual. ¿Continuar?"))
        return;
      const result = await restoreLandingPublicationToDraft({
        publicationId,
        expectedDraftVersion: version,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Publicación copiada al borrador.");
      router.refresh();
    });
  }

  const announcements = content.announcement.items;
  const audience = content.sections.audience.items;
  const family = content.sections.festivalFamily.items;
  const availableFestivalType = (
    ["glitter", "twinkler", "festicker"] as const
  ).find((type) => !family.some((item) => item.festivalType === type));
  const gallery = content.sections.community.gallery;
  const testimonials = content.sections.community.testimonials;
  const partners = content.sections.partners.items;

  return (
    <main className="container max-w-6xl p-4 md:p-6">
      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              La página pública se actualizará con el borrador v{version}. Podés
              restaurar una publicación anterior desde el historial si lo
              necesitás.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={publish}>
              Publicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="sticky top-[76px] z-20 -mx-4 mb-6 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:top-[84px]">
        <div className="mr-auto">
          <h1 className="font-display text-2xl font-bold">
            Contenido de inicio
          </h1>
          <p className="text-sm text-muted-foreground">
            Borrador v{version} · {dirty ? "cambios sin guardar" : "guardado"}
            {updatedAt
              ? " · " + new Date(updatedAt).toLocaleString("es-BO")
              : ""}
          </p>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={importContent}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={preview}
        >
          Vista previa
        </Button>
        <Button type="button" disabled={pending} onClick={() => save()}>
          Guardar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            variant="outline"
            size="icon"
            disabled={pending}
            aria-label="Más acciones"
          >
            <MoreHorizontalIcon className="size-5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel>Más acciones</DropdownMenuLabel>
            {canPublish ? (
              <>
                <DropdownMenuItem
                  disabled={pending || dirty || version === 0}
                  onClick={() => setPublishDialogOpen(true)}
                >
                  Publicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem disabled={pending} onClick={exportContent}>
              <DownloadIcon className="mr-2 size-4" aria-hidden="true" />
              Exportar JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pending}
              onClick={() => importInputRef.current?.click()}
            >
              <UploadIcon className="mr-2 size-4" aria-hidden="true" />
              Importar JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mb-6 grid gap-3 rounded-xl border border-brand-border bg-brand-lavender/30 p-4 text-sm md:grid-cols-2">
        <p>
          <strong>Publicado:</strong>{" "}
          {publication
            ? "#" +
              publication.id +
              ", desde borrador v" +
              publication.sourceDraftVersion
            : "aún no hay una versión pública"}
        </p>
        <p className="text-muted-foreground">
          La página pública solo cambia al publicar. Imágenes: máximo 4 MB.
        </p>
      </div>
      <form onSubmit={(event) => event.preventDefault()}>
        <Accordion
          type="multiple"
          defaultValue={["announcement", "seo", "hero", "sections"]}
          className="rounded-xl border bg-card px-4"
        >
          <AccordionItem value="announcement">
            <AccordionTrigger>Anuncios</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Presentación</span>
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    {...register("announcement.display")}
                  >
                    <option value="stacked">Apilados</option>
                    <option value="rotating">Rotativos</option>
                  </select>
                  <span className="text-sm text-muted-foreground">
                    Apilados muestra todos. Rotativos alterna un anuncio a la
                    vez.
                  </span>
                </label>
                {content.announcement.display === "rotating" ? (
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">
                      Intervalo de rotación (segundos)
                    </span>
                    <input
                      type="number"
                      min={3}
                      max={60}
                      className="h-10 rounded-md border bg-background px-3"
                      {...register("announcement.rotationIntervalSeconds", {
                        setValueAs: (value) => (value ? Number(value) : 6),
                      })}
                    />
                    <span className="text-sm text-muted-foreground">
                      Entre 3 y 60 segundos.
                    </span>
                  </label>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Aparecen sobre la navegación pública y crecen en alto cuando el
                mensaje lo necesita. Un enlace muestra una flecha como
                indicador.
              </p>
              {announcements.map((item, index) => (
                <fieldset
                  key={item.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-2"
                >
                  <legend className="px-1 font-medium">
                    Anuncio {index + 1}
                  </legend>
                  <Field
                    label="Mensaje"
                    name={path("announcement.items", index, "text")}
                    register={register}
                    multiline
                  />
                  <Field
                    label="Enlace opcional"
                    name={path("announcement.items", index, "href")}
                    register={register}
                  />
                  <SectionLinkPicker
                    href={item.href}
                    name={path("announcement.items", index, "href")}
                    setValue={setValue}
                  />
                  <div className="md:col-span-2">
                    <RemoveButton
                      onClick={() => removeAt("announcement.items", index)}
                    />
                  </div>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="ghost"
                disabled={announcements.length >= 8}
                onClick={() =>
                  addTo("announcement.items", {
                    id: crypto.randomUUID(),
                    text: "Nuevo anuncio",
                    href: null,
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir anuncio
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="seo">
            <AccordionTrigger>SEO y redes</AccordionTrigger>
            <AccordionContent className="grid gap-4 md:grid-cols-2">
              <Field label="Título SEO" name="seo.title" register={register} />
              <Field
                label="Imagen para compartir (URL opcional)"
                name="seo.shareImageUrl"
                register={register}
              />
              <Field
                label="Descripción SEO"
                name="seo.description"
                register={register}
                multiline
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="hero">
            <AccordionTrigger>Portada</AccordionTrigger>
            <AccordionContent className="grid gap-4 md:grid-cols-2">
              <Field
                label="Título, primera parte"
                name="hero.titleLead"
                register={register}
              />
              <Field
                label="Título destacado"
                name="hero.titleAccent"
                register={register}
              />
              <Field
                label="Texto"
                name="hero.body"
                register={register}
                multiline
              />
              <div className="grid gap-3">
                <Field
                  label="CTA principal"
                  name="hero.primaryCta.label"
                  register={register}
                />
                <Field
                  label="Enlace CTA principal"
                  name="hero.primaryCta.href"
                  register={register}
                />
                <SectionLinkPicker
                  href={content.hero.primaryCta.href}
                  name="hero.primaryCta.href"
                  setValue={setValue}
                />
                <Toggle
                  label="Mostrar CTA principal"
                  checked={content.hero.primaryCta.show}
                  onChange={(value) =>
                    setValue("hero.primaryCta.show", value, {
                      shouldDirty: true,
                    })
                  }
                  help="Ocultalo si todavía no está listo el destino principal."
                />
                <Field
                  label="CTA secundario"
                  name="hero.secondaryCta.label"
                  register={register}
                />
                <Field
                  label="Enlace CTA secundario"
                  name="hero.secondaryCta.href"
                  register={register}
                />
                <SectionLinkPicker
                  href={content.hero.secondaryCta.href}
                  name="hero.secondaryCta.href"
                  setValue={setValue}
                />
                <Toggle
                  label="Mostrar CTA secundario"
                  checked={content.hero.secondaryCta.show}
                  onChange={(value) =>
                    setValue("hero.secondaryCta.show", value, {
                      shouldDirty: true,
                    })
                  }
                  help="Ocultalo si no querés mostrar un destino complementario."
                />
              </div>
              <ImageField
                label="Personaje de portada"
                base="hero.image"
                url={content.hero.image.url}
                fit="contain"
                help="Usá una imagen PNG o WebP con fondo transparente para que el personaje pueda salir del marco."
                register={register}
                setValue={setValue}
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="sections">
            <AccordionTrigger>Orden y visibilidad</AccordionTrigger>
            <AccordionContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Arrastrá para cambiar el orden. El patrón automático alterna
                neutro, lila, neutro y coral; podés elegir un fondo o
                restablecerlo para volver al patrón.
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onSectionDragEnd}
              >
                <SortableContext
                  items={content.sectionOrder}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-2">
                    {content.sectionOrder.map((section) => (
                      <SortableSection
                        key={section}
                        section={section}
                        enabled={sectionEnabled(section)}
                        onToggle={(value) => setEnabled(section, value)}
                        background={content.sectionBackgrounds[section]}
                        onBackgroundChange={(value) =>
                          setSectionBackground(section, value)
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="event">
            <AccordionTrigger>Próximo evento</AccordionTrigger>
            <AccordionContent className="grid gap-4 md:grid-cols-2">
              <Field
                label="Texto del botón"
                name="sections.eventSpotlight.primaryCtaLabel"
                register={register}
              />
              <Toggle
                label="Mostrar botón"
                checked={content.sections.eventSpotlight.showCta}
                onChange={(value) =>
                  setValue("sections.eventSpotlight.showCta", value, {
                    shouldDirty: true,
                  })
                }
                help="Ocultalo hasta que el evento tenga un destino listo."
              />
              <label className="grid gap-1.5">
                <span className="text-sm font-medium">Fuente</span>
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  {...register("sections.eventSpotlight.source")}
                >
                  <option value="active">Festival activo automático</option>
                  <option value="selected">Festival seleccionado</option>
                </select>
              </label>
              {content.sections.eventSpotlight.source === "selected" ? (
                <label className="grid gap-1.5">
                  <span className="text-sm font-medium">Festival</span>
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    {...register("sections.eventSpotlight.festivalId", {
                      setValueAs: (value) => (value ? Number(value) : null),
                    })}
                  >
                    <option value="">Elegí un festival</option>
                    {festivals.map((festival) => (
                      <option key={festival.id} value={festival.id}>
                        {festival.name} · {festival.status}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Se muestra el festival activo. Si no hay uno, la sección se
                  oculta.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="audience">
            <AccordionTrigger>Cómo participar</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field
                label="Título de sección"
                name="sections.audience.heading"
                register={register}
              />
              {audience.map((item, index) => (
                <fieldset
                  key={item.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-2"
                >
                  <legend className="px-1 font-medium">
                    Tarjeta {index + 1}
                  </legend>
                  <Field
                    label="Título"
                    name={path("sections.audience.items", index, "title")}
                    register={register}
                  />
                  <Field
                    label="CTA"
                    name={path("sections.audience.items", index, "cta.label")}
                    register={register}
                  />
                  <Field
                    label="Descripción"
                    name={path("sections.audience.items", index, "description")}
                    register={register}
                    multiline
                  />
                  <Field
                    label="Enlace CTA"
                    name={path("sections.audience.items", index, "cta.href")}
                    register={register}
                  />
                  <SectionLinkPicker
                    href={item.cta.href}
                    name={path("sections.audience.items", index, "cta.href")}
                    setValue={setValue}
                  />
                  <Toggle
                    label="Mostrar CTA"
                    checked={item.cta.show}
                    onChange={(value) =>
                      setValue(
                        path(
                          "sections.audience.items",
                          index,
                          "cta.show",
                        ) as never,
                        value as never,
                        { shouldDirty: true },
                      )
                    }
                    help="Ocultalo si todavía no hay una página de destino."
                  />
                  <Toggle
                    label="Llenar el recuadro de imagen"
                    checked={item.featured}
                    onChange={(value) =>
                      setValue(
                        path(
                          "sections.audience.items",
                          index,
                          "featured",
                        ) as never,
                        value as never,
                        { shouldDirty: true },
                      )
                    }
                    help="La imagen ocupa todo el recuadro; desactivá esta opción para mostrarla completa con espacio alrededor."
                  />
                  <ImageField
                    label="Imagen"
                    base={path("sections.audience.items", index, "image")}
                    url={item.image.url}
                    fit={item.featured ? "cover" : "contain"}
                    frameClassName="aspect-[4/3]"
                    register={register}
                    setValue={setValue}
                  />
                  <RemoveButton
                    disabled={audience.length === 1}
                    onClick={() => removeAt("sections.audience.items", index)}
                  />
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={audience.length >= 4}
                onClick={() =>
                  addTo("sections.audience.items", {
                    id: crypto.randomUUID(),
                    title: "Nueva tarjeta",
                    description: "Descripción",
                    image: {
                      url: "/img/landing-audiences/participants.png",
                      alt: "Descripción de imagen",
                    },
                    cta: { label: "Ver más", href: "/", show: true },
                    featured: false,
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir tarjeta
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="family">
            <AccordionTrigger>Familia de festivales</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field
                label="Título de sección"
                name="sections.festivalFamily.heading"
                register={register}
              />
              <Field
                label="Texto"
                name="sections.festivalFamily.body"
                register={register}
                multiline
              />
              {family.map((item, index) => (
                <fieldset
                  key={item.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-2"
                >
                  <legend className="px-1 font-medium">
                    Festival {index + 1}
                  </legend>
                  <Field
                    label="Nombre"
                    name={path(
                      "sections.festivalFamily.items",
                      index,
                      "displayName",
                    )}
                    register={register}
                  />
                  <Field
                    label="Frase del festival"
                    name={path(
                      "sections.festivalFamily.items",
                      index,
                      "description",
                    )}
                    register={register}
                    multiline
                  />
                  <Field
                    label="Enlace opcional"
                    name={path("sections.festivalFamily.items", index, "href")}
                    register={register}
                  />
                  <SectionLinkPicker
                    href={item.href}
                    name={path("sections.festivalFamily.items", index, "href")}
                    setValue={setValue}
                  />
                  <Toggle
                    label="Mostrar botón"
                    checked={item.showCta}
                    onChange={(value) =>
                      setValue(
                        path(
                          "sections.festivalFamily.items",
                          index,
                          "showCta",
                        ) as never,
                        value as never,
                        { shouldDirty: true },
                      )
                    }
                    help="Ocultalo mientras el festival no tenga página pública."
                  />
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">Tipo</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      {...register(
                        path(
                          "sections.festivalFamily.items",
                          index,
                          "festivalType",
                        ) as never,
                      )}
                    >
                      <option value="glitter">Glitter</option>
                      <option value="twinkler">Twinkler</option>
                      <option value="festicker">Festicker</option>
                    </select>
                  </label>
                  <ImageField
                    label="Imagen principal"
                    base={path(
                      "sections.festivalFamily.items",
                      index,
                      "fallbackImage",
                    )}
                    url={item.fallbackImage.url}
                    fit="contain"
                    frameClassName="aspect-[4/3]"
                    modalFrameClassName="max-w-3xl"
                    focalPoint={item.fallbackImage.focalPoint}
                    zoom={item.fallbackImage.zoom}
                    allowFocalPoint
                    help="Tocá la miniatura para ajustar el encuadre y el zoom."
                    register={register}
                    setValue={setValue}
                  />
                  <RemoveButton
                    disabled={family.length === 1}
                    onClick={() =>
                      removeAt("sections.festivalFamily.items", index)
                    }
                  />
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={!availableFestivalType}
                onClick={() => {
                  if (!availableFestivalType) return;
                  addTo("sections.festivalFamily.items", {
                    id: crypto.randomUUID(),
                    festivalType: availableFestivalType,
                    displayName: "Nuevo festival",
                    badge: "Próxima edición",
                    description: "Descripción",
                    fallbackImage: {
                      url: "/img/landing-festivals/glitter-characters.png",
                      alt: "Descripción de imagen",
                    },
                    href: null,
                    showCta: true,
                  });
                }}
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir festival
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="community">
            <AccordionTrigger>Comunidad</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field
                label="Título de sección"
                name="sections.community.heading"
                register={register}
              />
              <Field
                label="Texto"
                name="sections.community.body"
                register={register}
                multiline
              />
              <Field
                label="Título de testimonios"
                name="sections.community.testimonialHeading"
                register={register}
              />
              <h3 className="font-medium">Galería</h3>
              <p className="text-sm text-muted-foreground">
                El orden define el collage. El diseño alterna recortes
                panorámicos y verticales automáticamente, priorizando el centro
                de cada foto. Reordená las imágenes para cambiar la composición
                y tocá una miniatura para ajustar su encuadre.
              </p>
              {gallery.map((item, index) => (
                <div key={item.id} className="rounded-xl border p-3">
                  <ImageField
                    label={"Imagen " + (index + 1)}
                    base={path("sections.community.gallery", index, "image")}
                    url={item.image.url}
                    fit="cover"
                    frameClassName={getCommunityGalleryLayout(index).preview}
                    modalFrameClassName={getCommunityGalleryLayout(index).modal}
                    focalPoint={item.image.focalPoint}
                    zoom={item.image.zoom}
                    allowFocalPoint
                    register={register}
                    setValue={setValue}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label="Mover imagen hacia arriba"
                      title="Mover hacia arriba"
                      onClick={() =>
                        moveAt("sections.community.gallery", index, index - 1)
                      }
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === gallery.length - 1}
                      aria-label="Mover imagen hacia abajo"
                      title="Mover hacia abajo"
                      onClick={() =>
                        moveAt("sections.community.gallery", index, index + 1)
                      }
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <RemoveButton
                      className="ml-auto"
                      disabled={gallery.length === 1}
                      onClick={() =>
                        removeAt("sections.community.gallery", index)
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={gallery.length >= 8}
                onClick={() =>
                  addTo("sections.community.gallery", {
                    id: crypto.randomUUID(),
                    image: {
                      url: "/img/landing-carousel/hanon-show.png",
                      alt: "Descripción de imagen",
                      focalPoint: { ...CENTERED_IMAGE_FOCAL_POINT },
                      zoom: DEFAULT_IMAGE_ZOOM,
                    },
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir imagen
              </Button>
              <h3 className="font-medium">Testimonios</h3>
              {testimonials.map((item, index) => (
                <fieldset
                  key={item.id}
                  className="grid gap-3 rounded-xl border p-4 md:grid-cols-2"
                >
                  <legend className="px-1">Testimonio {index + 1}</legend>
                  <Field
                    label="Cita"
                    name={path(
                      "sections.community.testimonials",
                      index,
                      "quote",
                    )}
                    register={register}
                    multiline
                  />
                  <Field
                    label="Nombre"
                    name={path(
                      "sections.community.testimonials",
                      index,
                      "name",
                    )}
                    register={register}
                  />
                  <Field
                    label="Rol"
                    name={path(
                      "sections.community.testimonials",
                      index,
                      "role",
                    )}
                    register={register}
                  />
                  <ImageField
                    label="Foto"
                    base={path(
                      "sections.community.testimonials",
                      index,
                      "image",
                    )}
                    url={item.image.url}
                    register={register}
                    setValue={setValue}
                  />
                  <RemoveButton
                    onClick={() =>
                      removeAt("sections.community.testimonials", index)
                    }
                  />
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={testimonials.length >= 6}
                onClick={() =>
                  addTo("sections.community.testimonials", {
                    id: crypto.randomUUID(),
                    quote: "Nueva cita",
                    name: "Nombre",
                    role: "Rol",
                    image: {
                      url: "/img/landing-v4/testimonial-cata.png",
                      alt: "Retrato",
                    },
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir testimonio
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="partners">
            <AccordionTrigger>Aliados y patrocinio</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field
                label="Título de aliados"
                name="sections.partners.heading"
                register={register}
              />
              {partners.map((item, index) => (
                <div key={item.id} className="grid gap-3 rounded-lg border p-3">
                  <Field
                    label="Nombre accesible y respaldo"
                    name={path("sections.partners.items", index, "name")}
                    register={register}
                  />
                  <Field
                    label="URL del sitio del aliado (opcional)"
                    name={path("sections.partners.items", index, "href")}
                    register={register}
                    description="Al seleccionar el logo, abre esta dirección. Déjalo vacío si no debe enlazar."
                  />
                  {item.image ? (
                    <ImageField
                      label="Logo del aliado"
                      base={path("sections.partners.items", index, "image")}
                      url={item.image.url}
                      fit="contain"
                      frameClassName="h-20 w-full"
                      register={register}
                      setValue={setValue}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-fit"
                      onClick={() =>
                        setValue(
                          path(
                            "sections.partners.items",
                            index,
                            "image",
                          ) as never,
                          {
                            url: "",
                            alt: item.name,
                          } as never,
                          { shouldDirty: true },
                        )
                      }
                    >
                      <ImagePlusIcon className="mr-2 size-4" />
                      Añadir logo
                    </Button>
                  )}
                  <RemoveButton
                    onClick={() => removeAt("sections.partners.items", index)}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={partners.length >= 20}
                onClick={() =>
                  addTo("sections.partners.items", {
                    id: crypto.randomUUID(),
                    name: "Nuevo aliado",
                    image: null,
                    href: null,
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir aliado
              </Button>
              <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
                <Field
                  label="Título de patrocinio"
                  name="sections.partners.sponsorCta.heading"
                  register={register}
                />
                <Field
                  label="Correo"
                  name="sections.partners.sponsorCta.email"
                  register={register}
                />
                <Field
                  label="Texto de patrocinio"
                  name="sections.partners.sponsorCta.body"
                  register={register}
                  multiline
                />
                <Field
                  label="Etiqueta del correo"
                  name="sections.partners.sponsorCta.emailLabel"
                  register={register}
                />
                <Field
                  label="Botón"
                  name="sections.partners.sponsorCta.buttonLabel"
                  register={register}
                />
                <Field
                  label="Asunto de correo"
                  name="sections.partners.sponsorCta.emailSubject"
                  register={register}
                />
                <Toggle
                  label="Mostrar botón"
                  checked={content.sections.partners.sponsorCta.showButton}
                  onChange={(value) =>
                    setValue("sections.partners.sponsorCta.showButton", value, {
                      shouldDirty: true,
                    })
                  }
                  help="El correo sigue visible aunque ocultes este botón."
                />
                <ImageField
                  label="Imagen de patrocinio"
                  base="sections.partners.sponsorCta.image"
                  url={content.sections.partners.sponsorCta.image.url}
                  fit="contain"
                  register={register}
                  setValue={setValue}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="footer">
            <AccordionTrigger>Pie de página</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field
                label="Descripción"
                name="footer.description"
                register={register}
                multiline
              />
              <Field
                label="Correo de contacto"
                name="footer.contactEmail"
                register={register}
              />
              <Field
                label="Ubicación"
                name="footer.location"
                register={register}
              />
              <Field
                label="Texto legal"
                name="footer.copyrightText"
                register={register}
                multiline
                description="El año se muestra y actualiza automáticamente."
              />
              <ImageField
                label="Logo"
                base="footer.logo"
                url={content.footer.logo.url}
                fit="contain"
                frameClassName="h-20 w-full"
                register={register}
                setValue={setValue}
              />
              <LinkList
                title="Enlaces de festivales"
                name="footer.festivalLinks"
                values={content.footer.festivalLinks}
                register={register}
                setValue={setValue}
                removeAt={removeAt}
                addTo={addTo}
              />
              <LinkList
                title="Enlaces de comunidad"
                name="footer.communityLinks"
                values={content.footer.communityLinks}
                register={register}
                setValue={setValue}
                removeAt={removeAt}
                addTo={addTo}
              />
              <h3 className="font-medium">Redes sociales</h3>
              {content.footer.socialLinks.map((item, index) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-4"
                >
                  <Field
                    label="Etiqueta"
                    name={path("footer.socialLinks", index, "label")}
                    register={register}
                  />
                  <Field
                    label="Enlace"
                    name={path("footer.socialLinks", index, "href")}
                    register={register}
                  />
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium">Red</span>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      {...register(
                        path("footer.socialLinks", index, "network") as never,
                      )}
                    >
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                      <option value="tiktok">TikTok</option>
                      <option value="other">Otra</option>
                    </select>
                  </label>
                  <RemoveButton
                    onClick={() => removeAt("footer.socialLinks", index)}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={content.footer.socialLinks.length >= 8}
                onClick={() =>
                  addTo("footer.socialLinks", {
                    id: crypto.randomUUID(),
                    network: "other",
                    label: "Nueva red",
                    href: "https://",
                  })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Añadir red
              </Button>
            </AccordionContent>
          </AccordionItem>
          {canPublish ? (
            <AccordionItem value="history">
              <AccordionTrigger>Historial de publicaciones</AccordionTrigger>
              <AccordionContent>
                {history.length ? (
                  <div className="divide-y rounded-lg border">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 p-3 text-sm"
                      >
                        <span className="font-medium">#{item.id}</span>
                        <span className="text-muted-foreground">
                          Borrador v{item.sourceDraftVersion} ·{" "}
                          {new Date(item.publishedAt).toLocaleString("es-BO")}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          disabled={pending}
                          onClick={() => restore(item.id)}
                        >
                          Restaurar al borrador
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Todavía no hay publicaciones.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </form>
    </main>
  );
}

function LinkList({
  title,
  name,
  values,
  register,
  setValue,
  removeAt,
  addTo,
}: {
  title: string;
  name: "footer.festivalLinks" | "footer.communityLinks";
  values: Array<{ label: string; href: string }>;
  register: UseFormRegister<LandingPageContentV1>;
  setValue: UseFormSetValue<LandingPageContentV1>;
  removeAt: (name: string, index: number) => void;
  addTo: (name: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      {values.map((item, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <Field
            label="Etiqueta"
            name={path(name, index, "label")}
            register={register}
          />
          <Field
            label="Enlace"
            name={path(name, index, "href")}
            register={register}
          />
          <SectionLinkPicker
            href={item.href}
            name={path(name, index, "href")}
            setValue={setValue}
          />
          <RemoveButton onClick={() => removeAt(name, index)} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={values.length >= 10}
        onClick={() => addTo(name, { label: "Nuevo enlace", href: "/" })}
      >
        <PlusIcon className="mr-2 size-4" />
        Añadir enlace
      </Button>
    </div>
  );
}

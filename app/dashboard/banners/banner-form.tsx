"use client";

import { BannerImageUpload } from "@/app/components/uploads/banner-image-upload";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import type { MarketingBannerRow } from "@/app/lib/marketing_banners/definitions";
import {
  createMarketingBanner,
  updateMarketingBanner,
} from "@/app/lib/marketing_banners/actions";
import { assertValidHref } from "@/app/lib/marketing_banners/validate-href";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const AUDIENCE_OPTIONS: {
  value: MarketingBannerRow["audience"];
  label: string;
}[] = [
  { value: "all", label: "Todos (landing y portal)" },
  { value: "public_only", label: "Solo visitantes (landing, sin sesión)" },
  { value: "participants_only", label: "Solo participantes (portal)" },
];

type FormState = {
  imageUrl: string;
  imageUrlTablet: string;
  imageUrlMobile: string;
  href: string;
  audience: MarketingBannerRow["audience"];
  openInNewTab: boolean;
  isVisible: boolean;
  label: string;
  altText: string;
};

function emptyForm(): FormState {
  return {
    imageUrl: "",
    imageUrlTablet: "",
    imageUrlMobile: "",
    href: "/",
    audience: "all",
    openInNewTab: false,
    isVisible: true,
    label: "",
    altText: "",
  };
}

function rowToForm(b: MarketingBannerRow): FormState {
  return {
    imageUrl: b.imageUrl,
    imageUrlTablet: b.imageUrlTablet ?? "",
    imageUrlMobile: b.imageUrlMobile ?? "",
    href: b.href,
    audience: b.audience,
    openInNewTab: b.openInNewTab,
    isVisible: b.isVisible,
    label: b.label ?? "",
    altText: b.altText ?? "",
  };
}

type Props =
  | { mode: "create" }
  | { mode: "edit"; initialBanner: MarketingBannerRow };

export default function BannerForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(
    props.mode === "edit" ? rowToForm(props.initialBanner) : emptyForm(),
  );

  const title =
    props.mode === "create"
      ? "Nuevo banner"
      : `Editar banner #${props.initialBanner.id}`;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hrefCheck = assertValidHref(form.href);
    if (!hrefCheck.ok) {
      toast.error(hrefCheck.message);
      return;
    }
    if (!form.imageUrl.trim()) {
      toast.error("La imagen de escritorio es obligatoria.");
      return;
    }

    startTransition(async () => {
      if (props.mode === "create") {
        try {
          const res = await createMarketingBanner({
            imageUrl: form.imageUrl,
            imageUrlTablet: form.imageUrlTablet || null,
            imageUrlMobile: form.imageUrlMobile || null,
            href: form.href,
            audience: form.audience,
            openInNewTab: form.openInNewTab,
            isVisible: form.isVisible,
            label: form.label || null,
            altText: form.altText || null,
          });
          if (!res.success) {
            toast.error(res.message);
            return;
          }
          toast.success("Banner creado");
        } catch (err) {
          toast.error(
            err instanceof Error && err.message
              ? err.message
              : "No se pudo crear el banner.",
          );
          return;
        }
      } else {
        try {
          const res = await updateMarketingBanner({
            id: props.initialBanner.id,
            imageUrl: form.imageUrl,
            imageUrlTablet: form.imageUrlTablet || null,
            imageUrlMobile: form.imageUrlMobile || null,
            href: form.href,
            audience: form.audience,
            openInNewTab: form.openInNewTab,
            isVisible: form.isVisible,
            label: form.label || null,
            altText: form.altText || null,
          });
          if (!res.success) {
            toast.error(res.message);
            return;
          }
          toast.success("Cambios guardados");
        } catch (err) {
          toast.error(
            err instanceof Error && err.message
              ? err.message
              : "No se pudieron guardar los cambios.",
          );
          return;
        }
      }
      router.push("/dashboard/banners");
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/dashboard/banners"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4 mr-1" />
        Volver al listado
      </Link>
      <h1 className="text-2xl font-bold">{title}</h1>
      <form onSubmit={onSubmit} className="space-y-6">
        <BannerImageUpload
          title="Escritorio"
          recommendation="Recomendado: 2400 × 600 px (aprox. 4:1) — imagen ancha mostrada en pantallas grandes"
          imageUrl={form.imageUrl}
          onChange={(imageUrl) => setForm((f) => ({ ...f, imageUrl }))}
          previewClassName="aspect-4/1"
          required
        />

        <BannerImageUpload
          title="Tablet"
          recommendation="Recomendado: 2400 × 800 px (aprox. 3:1) — pantallas medianas"
          imageUrl={form.imageUrlTablet}
          onChange={(imageUrlTablet) =>
            setForm((f) => ({ ...f, imageUrlTablet }))
          }
          previewClassName="aspect-3/1"
          successMessage="Imagen tablet subida"
        />

        <BannerImageUpload
          title="Móvil"
          recommendation="Recomendado: 1200 × 800 px (aprox. 3:2) — teléfonos"
          imageUrl={form.imageUrlMobile}
          onChange={(imageUrlMobile) =>
            setForm((f) => ({ ...f, imageUrlMobile }))
          }
          previewClassName="aspect-3/2"
          previewMaxWidth="max-w-sm"
          successMessage="Imagen móvil subida"
        />

        <div className="space-y-2">
          <Label htmlFor="href">Enlace (destino al hacer clic)</Label>
          <Input
            id="href"
            value={form.href}
            onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
            placeholder="/festivals/1 o https://…"
          />
        </div>
        <div className="space-y-2">
          <Label>Audiencia</Label>
          <Select
            value={form.audience}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, audience: v as FormState["audience"] }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="newtab">Abrir en nueva pestaña</Label>
          <Switch
            id="newtab"
            checked={form.openInNewTab}
            onCheckedChange={(c) => setForm((f) => ({ ...f, openInNewTab: c }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="form-vis">Visible en el carrusel</Label>
          <Switch
            id="form-vis"
            checked={form.isVisible}
            onCheckedChange={(c) => setForm((f) => ({ ...f, isVisible: c }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="label">Nombre interno (opcional)</Label>
          <Input
            id="label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="alt">
            Texto alternativo (accesibilidad, opcional)
          </Label>
          <Input
            id="alt"
            value={form.altText}
            onChange={(e) =>
              setForm((f) => ({ ...f, altText: e.target.value }))
            }
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/banners">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : props.mode === "create" ? (
              "Crear"
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

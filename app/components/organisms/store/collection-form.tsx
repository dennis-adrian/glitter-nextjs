"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import CollectionBanner from "./collection-banner";
import { saveMerchCollection } from "@/app/lib/merch/actions";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import type { CollectionInput } from "@/app/lib/merch/collection-schema";
import type {
  CollectionOption,
  MerchCollection,
} from "@/app/lib/merch/definitions";

export default function CollectionForm({
  collection,
  festivalOptions,
  productOptions,
}: {
  collection?: CollectionInput;
  festivalOptions: CollectionOption[];
  productOptions: CollectionOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [imageUrl, setImageUrl] = useState(collection?.imageUrl ?? "");
  const [campaignImageUrl, setCampaignImageUrl] = useState(
    collection?.campaignImageUrl ?? "",
  );
  const [campaignTextTone, setCampaignTextTone] = useState<"dark" | "light">(
    collection?.campaignTextTone ?? "dark",
  );
  const [showInHero, setShowInHero] = useState(collection?.showInHero ?? false);
  const [isVisible, setIsVisible] = useState(collection?.isVisible ?? false);
  const [festivalId, setFestivalId] = useState<number | null>(
    collection?.festivalId ?? null,
  );
  const [selectedProductIds, setSelectedProductIds] = useState(
    collection?.productIds ?? [],
  );
  const [productSearch, setProductSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [campaignUploading, setCampaignUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedProductIdSet = new Set(selectedProductIds);
  const selectedProducts = productOptions.filter((product) =>
    selectedProductIdSet.has(product.id),
  );
  const normalizedSearch = productSearch
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  const matchingProducts = productOptions.filter((product) =>
    product.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .includes(normalizedSearch),
  );
  const availableProducts = matchingProducts.filter(
    (product) => !selectedProductIdSet.has(product.id),
  );

  function setProductSelected(id: number, selected: boolean) {
    setSelectedProductIds((ids) =>
      selected
        ? ids.includes(id)
          ? ids
          : [...ids, id]
        : ids.filter((productId) => productId !== id),
    );
  }

  const previewCollection: MerchCollection = {
    id: collection?.id ?? 0,
    name: name.trim() || "Nombre de la colección",
    slug: collection?.slug ?? "preview",
    description: description.trim() || null,
    imageUrl: isAllowedProgramArtworkUrl(imageUrl) ? imageUrl : null,
    campaignImageUrl: isAllowedProgramArtworkUrl(campaignImageUrl)
      ? campaignImageUrl
      : null,
    campaignTextTone,
    productIds: selectedProductIds,
  };

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (uploading || campaignUploading || pending) return;
        const form = new FormData(event.currentTarget);
        setError("");
        setPending(true);
        try {
          const result = await saveMerchCollection({
            id: collection?.id,
            name,
            slug: String(form.get("slug") ?? ""),
            description,
            imageUrl,
            campaignImageUrl,
            campaignTextTone,
            showInHero,
            festivalId,
            sortOrder: Number(form.get("sortOrder")),
            isVisible,
            productIds: selectedProductIds,
          });
          if (!result.success) {
            setError(result.message);
            return;
          }
          router.push("/dashboard/store/collections");
          router.refresh();
        } catch {
          setError("No se pudo guardar la colección. Intenta nuevamente.");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-4 rounded-xl border p-4">
          <h3 className="text-sm font-medium">Exhibición en tienda</h3>
          <div className="flex items-center gap-3 text-sm">
            <Checkbox
              id="collection-visible"
              checked={isVisible}
              onCheckedChange={(checked) => setIsVisible(checked === true)}
            />
            <label htmlFor="collection-visible" className="cursor-pointer">
              Publicar en la tienda
            </label>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Checkbox
              id="show-in-hero"
              checked={showInHero}
              onCheckedChange={(checked) => setShowInHero(checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <label
                htmlFor="show-in-hero"
                className="cursor-pointer font-medium"
              >
                Mostrar en el banner principal
              </label>
              <p className="text-xs text-muted-foreground">
                Solo se incluyen colecciones publicadas con productos visibles.
                Varias colecciones destacadas se alternan cada 8 segundos. Si
                ninguna está destacada, se muestra la primera colección
                publicada.
              </p>
            </div>
          </div>
        </div>
        <label className="block space-y-2 text-sm font-medium">
          Nombre
          <Input
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Clásicos de Glitter"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Identificador de URL
          <Input
            name="slug"
            required
            maxLength={160}
            pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*"
            defaultValue={collection?.slug}
            placeholder="clasicos-glitter"
          />
          <span className="block text-xs font-normal text-muted-foreground">
            Letras minúsculas, números y guiones. Enlace:
            /merch/collections/clasicos-glitter. Cambiarlo modifica el enlace
            compartido.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Descripción
          <Textarea
            name="description"
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </label>
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-medium">Portada de la colección</h3>
          <p className="text-xs text-muted-foreground">
            Imagen para las tarjetas de colecciones. Recomendado: 1200 × 800 px
            (3:2). Otros formatos se muestran completos y centrados.
          </p>
          {isAllowedProgramArtworkUrl(imageUrl) && (
            <div className="relative aspect-[3/2] max-w-sm overflow-hidden rounded-lg bg-muted">
              <Image
                src={imageUrl}
                alt="Portada de la colección"
                fill
                sizes="384px"
                className="object-contain"
              />
            </div>
          )}
          <UploadThingImageButton
            endpoint="bannerImage"
            hasImage={!!imageUrl}
            onUploadComplete={setImageUrl}
            onUploading={setUploading}
          />
          <label className="block space-y-2 text-sm">
            URL de imagen (opcional)
            <Input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </label>
          {imageUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setImageUrl("")}
            >
              Quitar portada
            </Button>
          )}
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-medium">Banner de campaña</h3>
          <p className="text-xs text-muted-foreground">
            Opcional. Se usa en la página de la colección y en la portada de la
            tienda cuando esta colección está destacada en el banner.
            Recomendado: 1920 × 800 px, sin texto y con el motivo principal a la
            derecha. El nombre y la descripción se muestran sobre el lado
            izquierdo; en móvil aparecen debajo. Sin banner, se usa la portada
            con el fondo violeta de Glitter.
          </p>
          <UploadThingImageButton
            endpoint="bannerImage"
            hasImage={!!campaignImageUrl}
            onUploadComplete={setCampaignImageUrl}
            onUploading={setCampaignUploading}
          />
          <label className="block space-y-2 text-sm">
            URL del banner (opcional)
            <Input
              value={campaignImageUrl}
              onChange={(event) => setCampaignImageUrl(event.target.value)}
            />
          </label>
          <div className="space-y-2 text-sm">
            <label htmlFor="campaign-text-tone" className="block font-medium">
              Contraste del banner
            </label>
            <Select
              value={campaignTextTone}
              onValueChange={(value) =>
                setCampaignTextTone(value === "light" ? "light" : "dark")
              }
            >
              <SelectTrigger id="campaign-text-tone" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">
                  Texto oscuro · imagen clara
                </SelectItem>
                <SelectItem value="light">
                  Texto claro · imagen oscura
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ajusta el texto y el degradado para que el banner se lea bien.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Vista previa del banner</h4>
            <CollectionBanner collection={previewCollection} preview />
          </div>
          {campaignImageUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCampaignImageUrl("")}
            >
              Quitar banner
            </Button>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <label htmlFor="collection-festival" className="block font-medium">
            Festival relacionado (opcional)
          </label>
          <Select
            value={festivalId === null ? "none" : String(festivalId)}
            onValueChange={(value) =>
              setFestivalId(value === "none" ? null : Number(value))
            }
          >
            <SelectTrigger id="collection-festival" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin festival</SelectItem>
              {festivalOptions.map((festival) => (
                <SelectItem key={festival.id} value={String(festival.id)}>
                  {festival.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            La colección tiene su propio nombre, portada y visibilidad, incluso
            si está relacionada con un festival.
          </p>
        </div>
        <label className="block max-w-sm space-y-2 text-sm font-medium">
          Orden en la tienda
          <Input
            name="sortOrder"
            type="number"
            min={1}
            max={2147483647}
            step={1}
            required
            defaultValue={collection?.sortOrder ?? 1}
          />
          <span className="block text-xs font-normal text-muted-foreground">
            Menor número primero. También define el orden de los banners
            destacados.
          </span>
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            Productos de la colección
          </legend>
          <p className="text-xs text-muted-foreground">
            Podés agregar cualquier producto de merch. Solo los productos
            publicados aparecen en la tienda.
          </p>
          <label
            htmlFor="collection-product-search"
            className="block space-y-2 text-sm font-medium"
          >
            Buscar productos
            <Input
              id="collection-product-search"
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Nombre del producto"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Seleccionados ({selectedProducts.length})
              </p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3">
                {selectedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex min-h-10 items-center gap-3 text-sm"
                  >
                    <Checkbox
                      id={`collection-product-${product.id}`}
                      checked
                      onCheckedChange={(checked) =>
                        setProductSelected(product.id, checked === true)
                      }
                    />
                    <label
                      htmlFor={`collection-product-${product.id}`}
                      className="cursor-pointer"
                    >
                      {product.name}
                    </label>
                  </div>
                ))}
                {selectedProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Todavía no agregaste productos.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Agregar productos</p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3">
                {availableProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex min-h-10 items-center gap-3 text-sm"
                  >
                    <Checkbox
                      id={`collection-product-${product.id}`}
                      checked={false}
                      onCheckedChange={(checked) =>
                        setProductSelected(product.id, checked === true)
                      }
                    />
                    <label
                      htmlFor={`collection-product-${product.id}`}
                      className="cursor-pointer"
                    >
                      {product.name}
                    </label>
                  </div>
                ))}
                {availableProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {productOptions.length === 0
                      ? "Agregá productos de merch para incluirlos aquí."
                      : matchingProducts.length === 0
                        ? "No encontramos productos con ese nombre."
                        : "Ya seleccionaste todos los productos encontrados."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </fieldset>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={pending || uploading || campaignUploading}
        >
          {pending ? "Guardando..." : "Guardar colección"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/store/collections">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

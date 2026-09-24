"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { UploadThingImageButton } from "@/app/components/uploads/uploadthing-image-button";
import BundleCover from "./bundle-cover";
import {
  deleteMerchBundle,
  saveMerchBundle,
} from "@/app/lib/merch/bundle-actions";
import type {
  BundleCatalogProduct,
  BundleRecord,
} from "@/app/lib/merch/bundle-definitions";
import {
  evaluateBundle,
  formatBundleMoney,
  toCents,
} from "@/app/lib/merch/bundle-pricing";
import { MAX_BUNDLE_COMPONENTS } from "@/app/lib/merch/bundle-schema";
import type { CollectionOption } from "@/app/lib/merch/definitions";
import { merchBundlePath } from "@/app/lib/merch/paths";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import {
  getProductVariantImageUrl,
  getVariantLabel,
} from "@/app/lib/products/variants";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";

type EditableComponent = {
  uid: string;
  id?: number;
  productId: number;
  quantity: string;
  variantIds: number[];
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");

function productPriceLabel(product: BundleCatalogProduct) {
  const variants = (product.variants ?? []).filter((v) => v.isVisible);
  const prices = variants.length
    ? variants.map((variant) =>
        toCents(getProductPriceAtPurchase(product, variant)),
      )
    : [toCents(getProductPriceAtPurchase(product))];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max
    ? formatBundleMoney(min)
    : `${formatBundleMoney(min)} – ${formatBundleMoney(max)}`;
}

function productFlags(product: BundleCatalogProduct) {
  return [
    product.storeCategory !== "merch" && "No es merch",
    !product.isVisible && "Oculto",
    !product.isPurchasable && "No se vende",
  ].filter(Boolean) as string[];
}

export default function BundleForm({
  bundle,
  revision,
  products,
  collectionOptions,
}: {
  bundle?: BundleRecord;
  /** Save token loaded with `bundle`; the server rejects a stale one. */
  revision?: string | null;
  products: BundleCatalogProduct[];
  collectionOptions: CollectionOption[];
}) {
  const router = useRouter();
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const [name, setName] = useState(bundle?.name ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [imageUrl, setImageUrl] = useState(bundle?.imageUrl ?? "");
  const [isVisible, setIsVisible] = useState(bundle?.isVisible ?? false);
  const [price, setPrice] = useState(bundle ? String(bundle.price) : "");
  const [components, setComponents] = useState<EditableComponent[]>(
    () =>
      bundle?.components.map((component) => ({
        uid: `existing-${component.id}`,
        id: component.id,
        productId: component.productId,
        quantity: String(component.quantity),
        variantIds: component.variantIds,
      })) ?? [],
  );
  const [nextUid, setNextUid] = useState(1);
  const [collectionIds, setCollectionIds] = useState<number[]>(
    bundle?.collectionIds ?? [],
  );
  const [productSearch, setProductSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const search = normalize(productSearch.trim());
  const searchResults = search
    ? products
        .filter(
          (product) =>
            product.storeCategory === "merch" &&
            normalize(product.name).includes(search),
        )
        .slice(0, 12)
    : [];

  const priceNumber = Number(price.replace(",", "."));
  const evaluation = evaluateBundle(
    {
      price: Number.isFinite(priceNumber) ? priceNumber : 0,
      components: components.map((component, index) => ({
        id: component.id ?? -(index + 1),
        productId: component.productId,
        quantity: Math.max(1, Math.trunc(Number(component.quantity)) || 1),
        sortOrder: index,
        variantIds: component.variantIds,
      })),
    },
    productsById,
    { mode: "publish" },
  );
  const savingsCents =
    evaluation.separateMinCents != null
      ? evaluation.separateMinCents - evaluation.priceCents
      : null;

  function updateComponent(
    uid: string,
    change: (component: EditableComponent) => EditableComponent,
  ) {
    setComponents((current) =>
      current.map((component) =>
        component.uid === uid ? change(component) : component,
      ),
    );
  }

  function addProduct(product: BundleCatalogProduct) {
    if (components.length >= MAX_BUNDLE_COMPONENTS) return;
    const visibleVariantIds = (product.variants ?? [])
      .filter((variant) => variant.isVisible)
      .map((variant) => variant.id);
    setComponents((current) => [
      ...current,
      {
        uid: `new-${nextUid}`,
        productId: product.id,
        quantity: "1",
        variantIds: visibleVariantIds,
      },
    ]);
    setNextUid((value) => value + 1);
    setProductSearch("");
  }

  function moveComponent(index: number, offset: -1 | 1) {
    setComponents((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleDelete() {
    if (!bundle) return;
    setPending(true);
    setError("");
    try {
      const result = await deleteMerchBundle(bundle.id);
      if (!result.success) {
        setError(result.message);
        return;
      }
      router.push("/dashboard/store/bundles");
      router.refresh();
    } catch {
      setError("No se pudo eliminar el combo. Intenta nuevamente.");
    } finally {
      setPending(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <form
      className="max-w-3xl space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (uploading || pending) return;
        const form = new FormData(event.currentTarget);
        setError("");
        setPending(true);
        try {
          const result = await saveMerchBundle({
            id: bundle?.id,
            revision: revision ?? undefined,
            name,
            slug: String(form.get("slug") ?? ""),
            description,
            imageUrl,
            price: priceNumber,
            isVisible,
            sortOrder: Number(form.get("sortOrder")),
            components: components.map((component) => ({
              id: component.id,
              productId: component.productId,
              quantity: Number(component.quantity),
              variantIds: component.variantIds,
            })),
            collectionIds,
          });
          if (!result.success) {
            setError(result.message);
            return;
          }
          router.push("/dashboard/store/bundles");
          router.refresh();
        } catch {
          setError("No se pudo guardar el combo. Intenta nuevamente.");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-2 rounded-xl border p-4">
          <div className="flex items-center gap-3 text-sm">
            <Checkbox
              id="bundle-visible"
              checked={isVisible}
              onCheckedChange={(checked) => setIsVisible(checked === true)}
            />
            <label
              htmlFor="bundle-visible"
              className="cursor-pointer font-medium"
            >
              Publicar en la tienda
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Solo se publica si tiene al menos dos productos distintos
            disponibles y su precio es menor que comprarlos por separado. Si
            luego un producto cambia de precio o deja de estar disponible, el
            combo se oculta automáticamente.
          </p>
        </div>

        <label className="block space-y-2 text-sm font-medium">
          Nombre
          <Input
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Kit Clásicos Glitter"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Identificador de URL
          <Input
            name="slug"
            required
            maxLength={160}
            pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*"
            defaultValue={bundle?.slug}
            placeholder="kit-clasicos"
          />
          <span className="block text-xs font-normal text-muted-foreground">
            Letras minúsculas, números y guiones. Enlace:{" "}
            {bundle
              ? merchBundlePath(bundle.slug)
              : "/merch/combos/kit-clasicos"}
            . Cambiarlo modifica el enlace compartido.
          </span>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          Descripción
          <Textarea
            name="description"
            maxLength={2000}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-medium">Portada del combo</h3>
          <p className="text-xs text-muted-foreground">
            Opcional. Recomendado: 1200 × 1200 px. Sin portada se muestra un
            collage con las imágenes de los productos incluidos.
          </p>
          <BundleCover
            name={name || "Combo"}
            imageUrl={isAllowedProgramArtworkUrl(imageUrl) ? imageUrl : null}
            componentImageUrls={components.map((component) => {
              const product = productsById.get(component.productId);
              return product ? getProductVariantImageUrl(product, null) : null;
            })}
            sizes="256px"
            className="aspect-square w-48 rounded-lg"
          />
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

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium">Productos incluidos</legend>
          <p className="text-xs text-muted-foreground">
            Elegí cuántas unidades incluye el combo. En productos con tallas o
            colores, marcá una sola variante para dejarla fija o varias para que
            el cliente elija. Las variantes elegibles deben tener el mismo
            precio individual.
          </p>
          {components.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Todavía no agregaste productos.
            </p>
          )}
          <ol className="space-y-3">
            {components.map((component, index) => {
              const product = productsById.get(component.productId);
              const componentIssues = evaluation.issues.filter(
                (issue) => issue.componentId === (component.id ?? -(index + 1)),
              );
              const variants = product?.variants ?? [];
              return (
                <li
                  key={component.uid}
                  className="space-y-3 rounded-xl border p-4"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      <Image
                        src={
                          (product &&
                            getProductVariantImageUrl(product, null)) ??
                          PLACEHOLDER_IMAGE_URLS["300"]
                        }
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    {/* Wide enough that the controls wrap below on phones. */}
                    <div className="min-w-48 flex-1">
                      <p className="break-words font-medium">
                        {product?.name ?? "Producto eliminado"}
                      </p>
                      {product && (
                        <p className="text-xs text-muted-foreground">
                          Precio individual {productPriceLabel(product)}
                          {productFlags(product).map((flag) => ` · ${flag}`)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Subir ${product?.name ?? "producto"}`}
                        disabled={index === 0}
                        onClick={() => moveComponent(index, -1)}
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Bajar ${product?.name ?? "producto"}`}
                        disabled={index === components.length - 1}
                        onClick={() => moveComponent(index, 1)}
                      >
                        <ArrowDownIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar ${product?.name ?? "producto"}`}
                        onClick={() =>
                          setComponents((current) =>
                            current.filter(
                              (entry) => entry.uid !== component.uid,
                            ),
                          )
                        }
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <label className="flex max-w-40 flex-col gap-1 text-sm">
                    Cantidad
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      required
                      value={component.quantity}
                      onChange={(event) =>
                        updateComponent(component.uid, (current) => ({
                          ...current,
                          quantity: event.target.value,
                        }))
                      }
                    />
                  </label>
                  {product && variants.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm">
                        Variantes elegibles
                        <span className="ml-1 text-xs text-muted-foreground">
                          {component.variantIds.length === 1
                            ? "· fija"
                            : component.variantIds.length > 1
                              ? "· el cliente elige"
                              : ""}
                        </span>
                      </legend>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {variants.map((variant) => {
                          const checked = component.variantIds.includes(
                            variant.id,
                          );
                          const inputId = `bundle-${component.uid}-variant-${variant.id}`;
                          return (
                            <div
                              key={variant.id}
                              className="flex min-h-10 items-center gap-3 text-sm"
                            >
                              <Checkbox
                                id={inputId}
                                checked={checked}
                                onCheckedChange={(value) =>
                                  updateComponent(component.uid, (current) => ({
                                    ...current,
                                    variantIds:
                                      value === true
                                        ? [...current.variantIds, variant.id]
                                        : current.variantIds.filter(
                                            (id) => id !== variant.id,
                                          ),
                                  }))
                                }
                              />
                              <label
                                htmlFor={inputId}
                                className="cursor-pointer"
                              >
                                {getVariantLabel(variant) ??
                                  `Variante #${variant.id}`}
                                <span className="text-muted-foreground">
                                  {" "}
                                  ·{" "}
                                  {formatBundleMoney(
                                    toCents(
                                      getProductPriceAtPurchase(
                                        product,
                                        variant,
                                      ),
                                    ),
                                  )}{" "}
                                  · stock {variant.stock}
                                  {!variant.isVisible && " · oculta"}
                                </span>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                  {componentIssues.map((issue) => (
                    <p key={issue.code} className="text-xs text-amber-700">
                      {issue.message}
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
          <div className="space-y-2">
            <label
              htmlFor="bundle-product-search"
              className="block text-sm font-medium"
            >
              Agregar producto
            </label>
            <Input
              id="bundle-product-search"
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder="Buscar por nombre"
              disabled={components.length >= MAX_BUNDLE_COMPONENTS}
            />
            {search && (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {searchResults.map((product) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 p-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block break-words">{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {productPriceLabel(product)}
                        {productFlags(product).map((flag) => ` · ${flag}`)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addProduct(product)}
                      aria-label={`Agregar ${product.name}`}
                    >
                      <PlusIcon className="size-4" />
                      Agregar
                    </Button>
                  </li>
                ))}
                {searchResults.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">
                    No encontramos productos de merch con ese nombre.
                  </li>
                )}
              </ul>
            )}
          </div>
        </fieldset>

        <div className="space-y-3 rounded-xl border p-4">
          <label className="block max-w-xs space-y-2 text-sm font-medium">
            Precio del combo (Bs)
            <Input
              name="price"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Comprando por separado</dt>
              <dd className="font-medium">
                {evaluation.separateMinCents == null
                  ? "—"
                  : evaluation.separateMinCents === evaluation.separateMaxCents
                    ? formatBundleMoney(evaluation.separateMinCents)
                    : `${formatBundleMoney(evaluation.separateMinCents)} – ${formatBundleMoney(evaluation.separateMaxCents!)}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ahorro del cliente</dt>
              <dd className="font-medium">
                {savingsCents != null &&
                savingsCents > 0 &&
                evaluation.priceCents > 0
                  ? `${formatBundleMoney(savingsCents)} (${Math.round(
                      (savingsCents / evaluation.separateMinCents!) * 100,
                    )}%)`
                  : "—"}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Se compara con los precios de venta actuales, incluidos los
            descuentos vigentes de cada producto.
          </p>
          {evaluation.issues.length > 0 && (
            <ul
              className="list-disc space-y-1 pl-5 text-sm text-amber-700"
              aria-live="polite"
            >
              {[
                ...new Set(evaluation.issues.map((issue) => issue.message)),
              ].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Colecciones (opcional)
          </legend>
          <p className="text-xs text-muted-foreground">
            El combo aparece en estas colecciones aunque sus productos no
            pertenezcan a ellas.
          </p>
          {collectionOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay colecciones.
            </p>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">
              {collectionOptions.map((collection) => {
                const inputId = `bundle-collection-${collection.id}`;
                return (
                  <div
                    key={collection.id}
                    className="flex min-h-10 items-center gap-3 text-sm"
                  >
                    <Checkbox
                      id={inputId}
                      checked={collectionIds.includes(collection.id)}
                      onCheckedChange={(checked) =>
                        setCollectionIds((current) =>
                          checked === true
                            ? [...current, collection.id]
                            : current.filter((id) => id !== collection.id),
                        )
                      }
                    />
                    <label htmlFor={inputId} className="cursor-pointer">
                      {collection.name}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

        <label className="block max-w-sm space-y-2 text-sm font-medium">
          Orden en la tienda
          <Input
            name="sortOrder"
            type="number"
            min={1}
            max={2147483647}
            step={1}
            required
            defaultValue={bundle?.sortOrder ?? 1}
          />
          <span className="block text-xs font-normal text-muted-foreground">
            Menor número primero.
          </span>
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Guardando..." : "Guardar combo"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/store/bundles">Cancelar</Link>
        </Button>
        {bundle &&
          (confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">¿Eliminar este combo?</span>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={handleDelete}
              >
                Sí, eliminar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                No
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Eliminar combo
            </Button>
          ))}
      </div>
    </form>
  );
}

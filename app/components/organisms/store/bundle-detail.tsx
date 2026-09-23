"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ClockIcon } from "lucide-react";
import { toast } from "sonner";
import BundleCover from "./bundle-cover";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { addBundleToCart } from "@/app/lib/cart/actions";
import { buildBundleLineKey } from "@/app/lib/cart/utils";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { formatDisplayDate } from "@/app/lib/formatters";
import type {
  BundleSelectionInput,
  PublicBundle,
} from "@/app/lib/merch/bundle-definitions";
import {
  formatBundleMoneyShort,
  maxBundleQuantity,
  resolveBundleSelection,
} from "@/app/lib/merch/bundle-pricing";
import { MAX_CART_BUNDLE_QUANTITY } from "@/app/lib/merch/bundle-schema";
import { cn } from "@/lib/utils";

function initialSelections(bundle: PublicBundle) {
  return Object.fromEntries(
    bundle.components
      .filter((component) => component.choice === "choice")
      .map((component) => {
        const inStock = component.options.find(
          (option) => option.stock >= component.quantity,
        );
        return [
          component.componentId,
          (inStock ?? component.options[0])?.variantId ?? null,
        ];
      }),
  ) as Record<number, number | null>;
}

/**
 * Options of one attribute ("Talla: S", "Talla: M") read better as a titled
 * group of values; mixed labels are shown in full.
 */
function optionGroup(options: PublicBundle["components"][number]["options"]): {
  legend: string;
  labelFor: (label: string | null) => string;
} {
  const matches = options.map((option) =>
    /^([^:/]+): ([^/]+)$/.exec(option.label ?? ""),
  );
  const names = new Set(matches.map((match) => match?.[1]));
  if (matches.every(Boolean) && names.size === 1) {
    const [name] = [...names];
    return {
      legend: `Elegí ${name!.toLocaleLowerCase("es")}`,
      labelFor: (label) => label!.slice(name!.length + 2),
    };
  }
  return { legend: "Elegí una opción", labelFor: (label) => label ?? "Opción" };
}

export default function BundleDetail({ bundle }: { bundle: PublicBundle }) {
  const { isAuthenticated, setItemCount, addGuestBundle, openCart } =
    useCartContext();
  const [selected, setSelected] = useState(() => initialSelections(bundle));
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const selections: BundleSelectionInput[] = Object.entries(selected)
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([componentId, productVariantId]) => ({
      componentId: Number(componentId),
      productVariantId,
    }));
  const resolution = resolveBundleSelection(bundle, selections);
  const available = resolution.ok
    ? maxBundleQuantity(resolution.components)
    : 0;
  const maxSelectable = Math.min(MAX_CART_BUNDLE_QUANTITY, available);
  const separateCents = resolution.ok
    ? resolution.separateCents
    : bundle.separateMinCents;
  const savingsCents = separateCents - bundle.priceCents;

  async function handleAdd() {
    if (!resolution.ok || available === 0) return;
    const count = Math.min(quantity, maxSelectable);
    setSubmitting(true);
    try {
      if (isAuthenticated) {
        const result = await addBundleToCart({
          bundleId: bundle.id,
          bundleVersion: bundle.version,
          quantity: count,
          selections,
        });
        if (!result.success) {
          toast.error(result.message ?? "No se pudo agregar el combo.");
          return;
        }
        setItemCount(result.newCount);
        if (result.message) toast.info(result.message);
      } else {
        addGuestBundle(
          {
            lineKey: buildBundleLineKey(bundle.id, selections),
            bundleId: bundle.id,
            bundleVersion: bundle.version,
            quantity: count,
            selections,
            name: bundle.name,
            slug: bundle.slug,
            imageUrl:
              bundle.imageUrl ?? resolution.components[0]?.imageUrl ?? null,
            unitPriceCents: bundle.priceCents,
            separateUnitPriceCents: separateCents,
            components: resolution.components.map((component) => ({
              productName: component.productName,
              variantLabel: component.variantLabel,
              quantity: component.quantity,
              imageUrl: component.imageUrl,
            })),
          },
          available,
        );
      }
      toast.success("Combo agregado al carrito", {
        action: { label: "Ver carrito", onClick: openCart },
      });
    } catch {
      toast.error("No se pudo agregar el combo. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-10">
      <BundleCover
        name={bundle.name}
        imageUrl={bundle.imageUrl}
        componentImageUrls={bundle.components.map((c) => c.imageUrl)}
        sizes="(min-width: 768px) 50vw, 100vw"
        className="aspect-square w-full rounded-2xl"
        priority
      />

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Combo
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">
            {bundle.name}
          </h1>
          {bundle.description && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {bundle.description}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold">
              {formatBundleMoneyShort(bundle.priceCents)}
            </span>
            <span className="text-base text-muted-foreground line-through">
              <span className="sr-only">Comprando por separado: </span>
              {formatBundleMoneyShort(separateCents)}
            </span>
          </div>
          <p className="w-fit rounded-full bg-brand-coral-soft px-3 py-1 text-sm font-semibold text-brand-ink">
            Ahorrás {formatBundleMoneyShort(savingsCents)}
          </p>
        </div>

        <section aria-labelledby="bundle-contents-title" className="space-y-3">
          <h2 id="bundle-contents-title" className="text-sm font-semibold">
            Incluye
          </h2>
          <ul className="divide-y rounded-xl border">
            {bundle.components.map((component) => {
              const chosen =
                component.choice === "choice"
                  ? component.options.find(
                      (option) =>
                        option.variantId === selected[component.componentId],
                    )
                  : component.options[0];
              const groupName = `bundle-${bundle.id}-component-${component.componentId}`;
              const group = optionGroup(component.options);
              return (
                <li key={component.componentId} className="flex gap-3 p-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={
                        chosen?.imageUrl ??
                        component.imageUrl ??
                        PLACEHOLDER_IMAGE_URLS["300"]
                      }
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      {component.quantity} ×{" "}
                      <Link
                        href={`/store/products/${encodeURIComponent(component.productSlug)}`}
                        className="hover:underline"
                      >
                        {component.productName}
                      </Link>
                    </p>
                    {component.choice === "fixed" && chosen?.label && (
                      <p className="text-xs text-muted-foreground">
                        {chosen.label}
                      </p>
                    )}
                    {component.choice === "choice" && (
                      <fieldset>
                        <legend className="mb-1.5 text-xs text-muted-foreground">
                          {group.legend}
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {component.options.map((option) => {
                            const soldOut = option.stock < component.quantity;
                            const inputId = `${groupName}-${option.variantId}`;
                            return (
                              <div key={option.variantId}>
                                <input
                                  id={inputId}
                                  type="radio"
                                  name={groupName}
                                  className="peer sr-only"
                                  checked={
                                    selected[component.componentId] ===
                                    option.variantId
                                  }
                                  disabled={soldOut}
                                  onChange={() =>
                                    setSelected((current) => ({
                                      ...current,
                                      [component.componentId]: option.variantId,
                                    }))
                                  }
                                />
                                <label
                                  htmlFor={inputId}
                                  className={cn(
                                    "flex min-h-10 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors",
                                    "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
                                    soldOut &&
                                      "cursor-not-allowed text-muted-foreground line-through",
                                  )}
                                >
                                  {group.labelFor(option.label)}
                                  {soldOut && (
                                    <span className="sr-only"> (agotado)</span>
                                  )}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                    {component.productStatus === "presale" && (
                      <p className="flex items-center gap-1 text-xs text-amber-700">
                        <ClockIcon className="size-3" aria-hidden="true" />
                        Pre-venta
                        {component.productAvailableDate &&
                          ` · disponible el ${formatDisplayDate(
                            component.productAvailableDate,
                            { month: "long", day: "numeric" },
                          )}`}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-3">
          <p
            className={cn(
              "text-sm",
              available === 0 ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {!resolution.ok
              ? resolution.message
              : available === 0
                ? bundle.inStock
                  ? "Sin stock para esta combinación. Probá con otra opción."
                  : "Este combo está agotado."
                : available <= 3
                  ? `Últimas ${available} unidades disponibles.`
                  : "Disponible."}
          </p>
          <div className="flex items-center gap-3">
            <label htmlFor="bundle-quantity" className="text-sm">
              Cantidad
            </label>
            <Select
              value={String(
                Math.max(1, Math.min(quantity, maxSelectable || 1)),
              )}
              onValueChange={(value) => setQuantity(Number(value))}
              disabled={maxSelectable === 0}
            >
              <SelectTrigger id="bundle-quantity" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  { length: Math.max(1, maxSelectable) },
                  (_, index) => index + 1,
                ).map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={!resolution.ok || available === 0 || submitting}
            onClick={handleAdd}
          >
            {submitting
              ? "Agregando..."
              : available === 0
                ? "Agotado"
                : "Agregar combo al carrito"}
          </Button>
          <p className="text-xs text-muted-foreground">
            El precio especial aplica al combo completo. Para llevar menos
            productos, compralos por separado a su precio individual.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import type { BundleLineIssue } from "@/app/lib/merch/bundle-definitions";
import { formatBundleMoney } from "@/app/lib/merch/bundle-pricing";
import { MAX_CART_BUNDLE_QUANTITY } from "@/app/lib/merch/bundle-schema";

export type BundleCartRowProps = {
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  separateUnitPriceCents: number;
  quantity: number;
  /** Stock limit for this line; null while it is still being checked. */
  maxQuantity: number | null;
  components: {
    productName: string;
    variantLabel: string | null;
    quantity: number;
  }[];
  issue: BundleLineIssue | null;
  message: string | null;
  pending?: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onAcceptChanges?: () => void;
};

/** One bundle offer in the cart; its components are changed only as a whole. */
export function BundleCartRow({
  name,
  imageUrl,
  unitPriceCents,
  separateUnitPriceCents,
  quantity,
  maxQuantity,
  components,
  issue,
  message,
  pending = false,
  onQuantityChange,
  onRemove,
  onAcceptChanges,
}: BundleCartRowProps) {
  const blocked =
    issue === "unavailable" ||
    issue === "selection_invalid" ||
    issue === "stale";
  const selectableMax = Math.max(
    quantity,
    Math.min(MAX_CART_BUNDLE_QUANTITY, maxQuantity ?? quantity),
  );
  const unitCount = components.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="flex gap-3 border-b py-4 last:border-b-0">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        <Image
          src={imageUrl ?? PLACEHOLDER_IMAGE_URLS["300"]}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <span className="rounded-full bg-brand-lavender px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
            Combo
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatBundleMoney(unitPriceCents)}
          {separateUnitPriceCents > unitPriceCents && (
            <span className="ml-1.5 text-xs line-through">
              <span className="sr-only">Por separado </span>
              {formatBundleMoney(separateUnitPriceCents)}
            </span>
          )}
        </p>

        {components.length > 0 && (
          <details className="group mt-1 text-xs">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              Incluye {unitCount} {unitCount === 1 ? "artículo" : "artículos"}
              <ChevronDownIcon
                className="size-3.5 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <ul className="space-y-0.5 pb-1 text-muted-foreground">
              {components.map((component, index) => (
                <li key={`${component.productName}-${index}`}>
                  {component.quantity} × {component.productName}
                  {component.variantLabel && ` (${component.variantLabel})`}
                </li>
              ))}
            </ul>
          </details>
        )}

        {message && (
          <p
            className={
              issue === "stock_insufficient"
                ? "mt-1 text-xs font-medium text-amber-600"
                : "mt-1 text-xs font-medium text-destructive"
            }
          >
            {message}
          </p>
        )}
        {issue === "stale" && onAcceptChanges && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8"
            disabled={pending}
            onClick={onAcceptChanges}
          >
            Aceptar precio actual
          </Button>
        )}

        <div className="mt-2">
          {blocked || maxQuantity === 0 ? (
            <span className="text-xs text-muted-foreground">
              Cantidad: {quantity}
            </span>
          ) : (
            <Select
              value={String(quantity)}
              onValueChange={(value) => onQuantityChange(Number(value))}
              disabled={pending}
            >
              <SelectTrigger
                className="h-7 w-16 text-sm"
                aria-label={`Cantidad de ${name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: selectableMax }, (_, i) => i + 1).map(
                  (value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between">
        <p className="text-sm font-semibold">
          {formatBundleMoney(unitPriceCents * quantity)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label={`Eliminar el combo ${name} del carrito`}
          disabled={pending}
          onClick={onRemove}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

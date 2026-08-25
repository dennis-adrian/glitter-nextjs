"use client";

import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { LowStockEntry } from "@/app/lib/products/actions";
import { AlertTriangleIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { use } from "react";

type LowStockAlertProps = {
  lowStockPromise: Promise<LowStockEntry[]>;
  allProductsHref?: string;
};

const MAX_VISIBLE_ITEMS = 4;

export default function LowStockAlert({
  lowStockPromise,
  allProductsHref = "/dashboard/store/products?stock=low",
}: LowStockAlertProps) {
  const products = use(lowStockPromise);

  if (products.length === 0) return null;

  const visibleProducts = products.slice(0, MAX_VISIBLE_ITEMS);
  const outOfStockCount = products.filter(
    (product) => product.stock === 0,
  ).length;
  const lowStockCount = products.length - outOfStockCount;
  const affectedProductCount = new Set(
    products.map((product) => product.productId),
  ).size;
  const summary = [
    outOfStockCount > 0
      ? `${outOfStockCount} ${outOfStockCount === 1 ? "agotado" : "agotados"}`
      : null,
    lowStockCount > 0 ? `${lowStockCount} con stock bajo` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="border-amber-200">
      <CardHeader className="gap-1 p-4 pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangleIcon
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-amber-600"
          />
          <CardTitle className="text-base text-amber-700">
            Inventario por reponer
          </CardTitle>
        </div>
        <p className="pl-7 text-sm text-muted-foreground">{summary}</p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {visibleProducts.map((product) => (
            <Link
              key={`${product.productId}:${product.variantId ?? "base"}`}
              href={`/dashboard/store/products/${product.productId}/edit`}
              className="flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-accent"
            >
              <span className="mr-2 truncate text-sm font-medium">
                {product.variantLabel
                  ? `${product.productName} (${product.variantLabel})`
                  : product.productName}
              </span>
              <Badge
                variant={product.stock === 0 ? "destructive" : "outline"}
                className={
                  product.stock !== 0 && product.stock !== null
                    ? "tabular-nums text-amber-600 border-amber-300"
                    : "tabular-nums"
                }
              >
                {product.stock === 0 ? "Agotado" : `${product.stock} unid.`}
              </Badge>
            </Link>
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-end p-4 pt-0">
        <Link
          href={allProductsHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 underline-offset-4 hover:underline"
        >
          Ver {affectedProductCount}{" "}
          {affectedProductCount === 1 ? "producto" : "productos"}
          <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}

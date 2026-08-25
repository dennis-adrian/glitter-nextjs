"use client";

import StatusDot, { type StatusTone } from "@/app/components/atoms/status-dot";
import DeleteProductModal from "@/app/components/organisms/products/delete-product-modal";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { toggleProductVisibility } from "@/app/lib/products/actions";
import { getProductEffectiveStock } from "@/app/lib/products/variants";
import {
  getStoreCategoryBadgeLabel,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import {
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  available: "Disponible",
  presale: "Preventa",
  sale: "En oferta",
};

function ProductCard({
  product,
  categoryScope,
}: {
  product: BaseProductWithImages;
  categoryScope: StoreCategoryScope;
}) {
  const [openDelete, setOpenDelete] = useState(false);
  const [visible, setVisible] = useState(product.isVisible);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const mainImage = product.images.find((img) => img.isMain);
  const imageUrl = mainImage?.imageUrl ?? product.images[0]?.imageUrl;
  const stock = getProductEffectiveStock(product);
  const variantCount = product.variants?.length ?? 0;
  const hasVariants = variantCount > 0;

  const stockTone: StatusTone =
    stock === 0 ? "danger" : stock <= 5 ? "warning" : "success";
  const stockLabel = hasVariants
    ? `${stock} unid · ${variantCount} var.`
    : `${stock} unid`;

  // "Disponible" is the default, so it earns no pill; the other states do.
  const showStatusBadge = product.status !== "available";

  async function handleVisibilityToggle(checked: boolean) {
    const prev = visible;
    setTogglingVisibility(true);
    setVisible(checked);
    try {
      const result = await toggleProductVisibility(product.id, checked);
      if (!result.success) {
        setVisible(prev);
        toast.error(result.message);
      }
    } catch (error) {
      setVisible(prev);
      console.error(error);
      toast.error("No se pudo actualizar la visibilidad.");
    } finally {
      setTogglingVisibility(false);
    }
  }

  return (
    <>
      <Card className="relative overflow-hidden">
        <div className="relative aspect-square w-full bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Sin imagen
            </div>
          )}
          {product.isFeatured && (
            <div className="absolute top-2 left-2">
              <StarIcon className="h-4 w-4 text-amber-500 fill-amber-500 drop-shadow" />
            </div>
          )}
          {/* Keep the compact visual treatment while announcing the state. */}
          {!visible && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <EyeOffIcon
                aria-hidden="true"
                className="h-6 w-6 text-muted-foreground"
              />
              <span className="sr-only">Producto oculto</span>
            </div>
          )}
        </div>
        <CardContent className="flex flex-col gap-1.5 p-3">
          <p className="text-sm font-medium leading-tight line-clamp-2">
            {product.name}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums">
              Bs {product.price.toFixed(2)}
            </span>
            <StatusDot
              tone={stockTone}
              label={stockLabel}
              className="shrink-0 text-xs tabular-nums"
            />
          </div>
          {(showStatusBadge || categoryScope === "all") && (
            <div className="flex flex-wrap gap-1.5">
              {showStatusBadge && (
                <Badge variant="outline" className="text-xs">
                  {STATUS_LABELS[product.status] ?? product.status}
                </Badge>
              )}
              {/* Category is noise once the list is scoped to one. */}
              {categoryScope === "all" && (
                <Badge variant="outline" className="text-xs">
                  {getStoreCategoryBadgeLabel(product.storeCategory)}
                </Badge>
              )}
            </div>
          )}
        </CardContent>

        {/* Stretched link: the whole card opens the editor. Declared after the
            content so it stacks above it, and below the menu's z-10. */}
        <Link
          href={`/dashboard/store/products/${product.id}/edit`}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Editar ${product.name}${visible ? "" : ", producto oculto"}`}
        />

        <div className="absolute right-2 top-2 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-background/90 shadow-sm backdrop-blur-sm hover:bg-background"
                aria-label={`Acciones para ${product.name}`}
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild className="py-2.5">
                <Link href={`/dashboard/store/products/${product.id}/edit`}>
                  <EditIcon className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={togglingVisibility}
                onSelect={() => handleVisibilityToggle(!visible)}
                className="py-2.5"
              >
                {visible ? (
                  <EyeOffIcon className="mr-2 h-4 w-4" />
                ) : (
                  <EyeIcon className="mr-2 h-4 w-4" />
                )}
                {visible ? "Ocultar" : "Mostrar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setOpenDelete(true)}
                className="py-2.5 text-destructive focus:text-destructive"
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
      <DeleteProductModal
        product={product}
        open={openDelete}
        setOpen={setOpenDelete}
      />
    </>
  );
}

type ProductsCardGridProps = {
  products: BaseProductWithImages[];
  categoryScope: StoreCategoryScope;
};

export default function ProductsCardGrid({
  products,
  categoryScope,
}: ProductsCardGridProps) {
  if (products.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-12">
        No hay productos. ¡Agrega el primero!
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          categoryScope={categoryScope}
        />
      ))}
    </div>
  );
}

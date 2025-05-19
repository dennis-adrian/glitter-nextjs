import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { BaseProduct } from "@/app/lib/products/definitions";
import Image from "next/image";
import Link from "next/link";
import StoreItemQuantityInput from "./store-item-quantity-input";

type StoreItemCardProps = {
  product: BaseProduct;
};

export default function StoreItemCard({ product }: StoreItemCardProps) {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg max-w-80">
      <div className="relative h-80 w-80 bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            width={320}
            height={320}
            placeholder="blur"
            blurDataURL="/placeholder-300x300.png"
          />
        ) : (
          <Image
            src="/img/placeholders/placeholder-300x300.png"
            alt="Imagen no disponible"
            width={320}
            height={320}
          />
        )}
        <Badge className="absolute top-2 left-2 bg-amber-500 hover:bg-amber-600">
          Pre-Venta
        </Badge>
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg">{product.name}</h3>
        <p className="text-muted-foreground text-sm">{product.description}</p>
        <div className="mt-2 font-bold">Bs{product.price.toFixed(2)}</div>
        {product.isPreOrder && product.availableDate && (
          <p className="text-xs text-amber-600 mt-1">
            Disponible el {formatDate(product.availableDate).toLocaleString()}
          </p>
        )}
        <StoreItemQuantityInput product={product} />
      </CardContent>
    </Card>
  );
}

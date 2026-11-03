"use client";

import { useCartContext } from "@/app/components/providers/cart-provider";
import { ScreenAction } from "@/app/components/navbar/screen-bar";
import { Button } from "@/app/components/ui/button";
import { ShoppingCartIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

function CartButton({
  itemCount,
  onOpen,
  showLabel = true,
}: {
  itemCount: number;
  onOpen: () => void;
  showLabel?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="relative flex items-center gap-2"
      aria-label={
        itemCount > 0
          ? `Abrir carrito, ${itemCount > 9 ? "9+" : itemCount}`
          : "Abrir carrito"
      }
      onClick={onOpen}
    >
      <ShoppingCartIcon className="w-4 h-4" />
      {showLabel && <span className="hidden sm:inline">Carrito</span>}
      {itemCount > 0 && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
          {itemCount > 9 ? "9+" : itemCount}
        </span>
      )}
    </Button>
  );
}

export default function StoreSubheader() {
  const { itemCount, openCart } = useCartContext();
  const pathname = usePathname();
  const isListingPage = pathname === "/merch" || pathname === "/supplies";
  const isSupplies = pathname === "/supplies";
  const Title = pathname.startsWith("/merch") ? "p" : "h1";
  // Below the store's own pages (a product, a collection, a combo), the
  // installed app's top bar carries the cart, so this strip steps aside there.
  // The bar is built outside the cart provider, so it gets a bound element.
  const barCart = useMemo(
    () => (
      <CartButton itemCount={itemCount} onOpen={openCart} showLabel={false} />
    ),
    [itemCount, openCart],
  );

  return (
    <>
      {isListingPage ? null : <ScreenAction>{barCart}</ScreenAction>}
      <div
        data-installed-hidden={isListingPage ? undefined : ""}
        className="sticky top-[calc(77px+var(--announcement-strip-height,0px))] lg:top-[calc(85px+var(--announcement-strip-height,0px))] z-40 bg-background border-b"
      >
        <div className="container min-w-0 px-3 py-3 flex items-center justify-between">
          <div>
            <Title className="text-xl md:text-2xl font-bold tracking-tight">
              Tiendita Glitter
            </Title>
            {isListingPage && (
              <p className="text-xs text-muted-foreground hidden sm:block">
                {isSupplies
                  ? "El Mercadito de Insumos: todo para mejorar la presentación de tu stand"
                  : "Descubrí la merch y las colecciones oficiales de Glitter"}
              </p>
            )}
          </div>

          <CartButton itemCount={itemCount} onOpen={openCart} />
        </div>
      </div>
    </>
  );
}

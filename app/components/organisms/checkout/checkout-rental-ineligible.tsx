"use client";

import { useRouter } from "next/navigation";

import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";

type CheckoutRentalIneligibleProps = {
  message: string;
};

export default function CheckoutRentalIneligible({
  message,
}: CheckoutRentalIneligibleProps) {
  const router = useRouter();
  const { openCart } = useCartContext();

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center space-y-4">
      <h1 className="text-xl font-semibold">No podés completar el checkout</h1>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button variant="outline" onClick={() => router.push("/merch")}>
          Volver a la tienda
        </Button>
        <Button onClick={() => openCart()}>Ver carrito</Button>
      </div>
    </div>
  );
}

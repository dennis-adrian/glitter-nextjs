"use client";

import Heading from "@/app/components/atoms/heading";

export function CheckoutPageHeader() {
  return (
    <div className="mb-4">
      <Heading level={2} data-installed-title="">
        Confirmar pedido
      </Heading>
      <p className="text-muted-foreground text-sm mt-1">
        Revisá tu pedido antes de confirmarlo.
      </p>
    </div>
  );
}

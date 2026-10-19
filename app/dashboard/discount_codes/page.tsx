import DiscountCodesTable from "@/app/components/organisms/discount_codes/table/discount-codes-table";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchDiscountCodes } from "@/app/lib/discount_codes/actions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Códigos de descuento",
};

export default async function DiscountCodesPage() {
  // Discount codes are global-admin only; the dashboard layout also admits
  // festival admins, and a layout is not a boundary.
  if (!(await requireAdmin())) redirect("/dashboard");

  const discountCodes = await fetchDiscountCodes();

  return (
    // Fills the dashboard's viewport-tall column so the table scrolls inside
    // itself and its toolbar and pagination stay on screen.
    <div className="container flex min-h-0 flex-1 flex-col gap-4 p-3 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">
            Códigos de descuento
          </h1>
          <p className="text-sm text-muted-foreground">
            Descuentos que los participantes aplican al pagar su reserva, para
            todos o solo para las personas que elijas.
          </p>
        </div>
        <RedirectButton
          href="/dashboard/discount_codes/add"
          className="w-full sm:w-auto"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Nuevo código
        </RedirectButton>
      </div>
      <DiscountCodesTable discountCodes={discountCodes} />
    </div>
  );
}

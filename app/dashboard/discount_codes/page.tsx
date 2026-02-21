import DiscountCodesTable from "@/app/components/organisms/discount_codes/table/discount-codes-table";
import { RedirectButton } from "@/app/components/redirect-button";
import { Suspense } from "react";

export default function DiscountCodesPage() {
  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold">Códigos de descuento</h1>
      <div className="my-4 w-full">
        <RedirectButton href="/dashboard/discount_codes/add">
          Agregar código
        </RedirectButton>
        <Suspense fallback={<div>Cargando...</div>}>
          <DiscountCodesTable />
        </Suspense>
      </div>
    </div>
  );
}

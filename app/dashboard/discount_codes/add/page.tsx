import DiscountCodeForm from "@/app/components/organisms/discount_codes/discount-code-form";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { getFestivalsOptions } from "@/app/lib/festivals/utils";
import { requireAdmin } from "@/app/lib/users/helpers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Nuevo código de descuento",
};

export default async function AddDiscountCodePage() {
  // Discount codes are global-admin only; the dashboard layout also admits
  // festival admins, and a layout is not a boundary.
  if (!(await requireAdmin())) redirect("/dashboard");

  const festivals = await fetchFestivals();

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Nuevo código de descuento</h1>
      <div className="max-w-xl">
        <DiscountCodeForm festivalsOptions={getFestivalsOptions(festivals)} />
      </div>
    </div>
  );
}

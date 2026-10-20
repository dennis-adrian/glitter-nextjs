import DiscountCodeForm from "@/app/components/organisms/discount_codes/discount-code-form";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { fetchDiscountCode } from "@/app/lib/discount_codes/actions";
import { getFestivalsOptions } from "@/app/lib/festivals/utils";
import ResourceNotFound from "@/app/components/resource-not-found";
import { requireAdmin } from "@/app/lib/users/helpers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const metadata: Metadata = {
  title: "Editar código de descuento",
};

export default async function EditDiscountCodePage(props: {
  params: Promise<{ id: string }>;
}) {
  // Discount codes are global-admin only; the dashboard layout also admits
  // festival admins, and a layout is not a boundary.
  if (!(await requireAdmin())) redirect("/dashboard");

  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) return <ResourceNotFound />;

  const [discountCode, festivals] = await Promise.all([
    fetchDiscountCode(validatedParams.data.id),
    fetchFestivals(),
  ]);

  if (!discountCode) return <ResourceNotFound />;

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Editar código de descuento</h1>
      <div className="max-w-xl">
        <DiscountCodeForm
          festivalsOptions={getFestivalsOptions(festivals)}
          discountCode={discountCode}
        />
      </div>
    </div>
  );
}

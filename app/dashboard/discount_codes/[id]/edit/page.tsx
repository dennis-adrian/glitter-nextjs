import DiscountCodeForm from "@/app/components/organisms/discount_codes/discount-code-form";
import { fetchProfiles } from "@/app/api/users/actions";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { fetchDiscountCode } from "@/app/lib/discount_codes/actions";
import { getFestivalsOptions } from "@/app/lib/festivals/utils";
import ResourceNotFound from "@/app/components/resource-not-found";
import { z } from "zod";

const ParamsSchema = z.object({ id: z.coerce.number() });

export default async function EditDiscountCodePage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) return <ResourceNotFound />;

  const [discountCode, festivals, users] = await Promise.all([
    fetchDiscountCode(validatedParams.data.id),
    fetchFestivals(),
    fetchProfiles(),
  ]);

  if (!discountCode) return <ResourceNotFound />;

  const festivalsOptions = getFestivalsOptions(festivals);
  const usersOptions = users.map((user) => ({
    value: user.id.toString(),
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  }));

  return (
    <div className="container p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Editar código de descuento</h1>
      <div className="max-w-lg">
        <DiscountCodeForm
          festivalsOptions={festivalsOptions}
          usersOptions={usersOptions}
          discountCode={discountCode}
        />
      </div>
    </div>
  );
}

import DiscountCodeForm from "@/app/components/organisms/discount_codes/discount-code-form";
import { fetchProfiles } from "@/app/api/users/actions";
import { fetchFestivals } from "@/app/lib/festivals/actions";
import { getFestivalsOptions } from "@/app/lib/festivals/utils";

export default async function AddDiscountCodePage() {
  const [festivals, users] = await Promise.all([
    fetchFestivals(),
    fetchProfiles(),
  ]);

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
      <h1 className="text-2xl font-bold mb-4">Agregar código de descuento</h1>
      <div className="max-w-lg">
        <DiscountCodeForm
          festivalsOptions={festivalsOptions}
          usersOptions={usersOptions}
        />
      </div>
    </div>
  );
}

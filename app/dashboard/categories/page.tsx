import { redirect } from "next/navigation";

import CategoriesList from "@/app/components/categories/categories-list";
import { fetchAdminCategories } from "@/app/lib/categories/queries";
import { requireAdmin } from "@/app/lib/users/helpers";

export default async function CategoriesDashboardPage() {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const categories = await fetchAdminCategories();

  return (
    <div className="container p-4 md:p-6">
      <CategoriesList categories={categories} />
    </div>
  );
}

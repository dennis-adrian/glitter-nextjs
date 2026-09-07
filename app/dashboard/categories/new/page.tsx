import { redirect } from "next/navigation";

import CategoryEditor from "@/app/components/categories/category-editor";
import { isManagementArea } from "@/app/lib/categories/definitions";
import { requireAdmin } from "@/app/lib/users/helpers";

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const rawArea = Array.isArray(params.area) ? params.area[0] : params.area;
  const defaultArea = isManagementArea(rawArea) ? rawArea : "illustration";

  return (
    <div className="container p-4 md:p-6">
      <CategoryEditor defaultArea={defaultArea} />
    </div>
  );
}

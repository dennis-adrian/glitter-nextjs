import { notFound, redirect } from "next/navigation";

import CategoryEditor from "@/app/components/categories/category-editor";
import { fetchAdminCategory } from "@/app/lib/categories/queries";
import { requireAdmin } from "@/app/lib/users/helpers";

type Props = { params: Promise<{ id: string }> };

export default async function EditCategoryPage({ params }: Props) {
  const profile = await requireAdmin();
  if (!profile) {
    redirect("/dashboard");
  }

  const { id: raw } = await params;
  if (!/^\d+$/.test(raw)) {
    notFound();
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) {
    notFound();
  }

  const category = await fetchAdminCategory(id);
  if (!category) {
    notFound();
  }

  return (
    <div className="container p-4 md:p-6">
      <CategoryEditor category={category} />
    </div>
  );
}

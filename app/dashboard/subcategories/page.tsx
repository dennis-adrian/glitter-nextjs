import SubcategoriesPage from "@/app/components/subcategories/pages/subcategories";
import TagsPage from "@/app/components/tags/pages/tags";
import { Suspense } from "react";

export default async function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <SubcategoriesPage />
    </Suspense>
  );
}

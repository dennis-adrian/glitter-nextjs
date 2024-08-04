import SubcategoriesPage from "@/app/components/subcategories/pages/subcategories";
import { Suspense } from "react";

export default async function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <SubcategoriesPage />
    </Suspense>
  );
}

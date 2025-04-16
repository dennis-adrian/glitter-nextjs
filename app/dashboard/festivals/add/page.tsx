import AddFestivalPage from "@/app/components/festivals/pages/AddFestivalPage";
import { Suspense } from "react";

export default async function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <AddFestivalPage />
    </Suspense>
  );
}

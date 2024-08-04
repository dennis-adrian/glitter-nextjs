import EditCategories from "@/app/(routes)/my_profile/edit/categories/component";
import Loader from "@/app/components/loader";
import { Suspense } from "react";

export default async function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <EditCategories />
    </Suspense>
  );
}

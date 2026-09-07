import Image from "next/image";

import PublicCategories from "@/app/components/categories/public-categories";
import { fetchPublicCategories } from "@/app/lib/categories/queries";

export default async function Page() {
  const categories = await fetchPublicCategories();

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Categorías</h1>
      <Image
        className="mx-auto mb-6 h-auto"
        alt="mascota de glitter"
        src="/img/glitter-mascot-with-stand-sm.png"
        height={320}
        width={198}
      />
      <PublicCategories categories={categories} />
    </div>
  );
}

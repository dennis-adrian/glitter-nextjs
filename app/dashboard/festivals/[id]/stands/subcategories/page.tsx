import { notFound } from "next/navigation";
import { z } from "zod";

import StandSubcategoryEditor from "@/app/components/maps/admin/stand-subcategory-editor";
import { getFestivalById } from "@/app/lib/festivals/helpers";
import {
  fetchAllSubcategories,
  fetchFestivalSectorsForSubcategoryEditor,
} from "@/app/lib/stands/subcategory-actions";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function StandSubcategoriesPage({
  params,
}: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return notFound();

  const { id } = parsed.data;
  const [festival, sectors, allSubcategories] = await Promise.all([
    getFestivalById(id),
    fetchFestivalSectorsForSubcategoryEditor(id),
    fetchAllSubcategories(),
  ]);

  if (!festival) return notFound();

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold md:text-3xl">
          Subcategorías de stands — {festival.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Asigna restricciones de subcategoría a los stands. Un stand sin
          subcategorías asignadas es visible para todos los usuarios de su
          categoría. Un stand con subcategorías solo es visible para usuarios
          que tengan al menos una de esas subcategorías en su perfil.
        </p>
      </div>
      <StandSubcategoryEditor
        festivalId={id}
        sectors={sectors}
        allSubcategories={allSubcategories}
      />
    </div>
  );
}

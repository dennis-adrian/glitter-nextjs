import { fetchSelectableCategories } from "@/app/lib/categories/queries";

export async function GET() {
  const rows = await fetchSelectableCategories();
  const subcategories = rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    descriptionHtml: row.descriptionHtml,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
    visibility: row.visibility,
    isExclusive: row.isExclusive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  return new Response(JSON.stringify(subcategories), { status: 200 });
}

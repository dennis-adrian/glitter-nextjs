import { fetchSelectableCategories } from "@/app/lib/categories/queries";

export async function GET() {
  const subcategories = await fetchSelectableCategories();
  return new Response(JSON.stringify(subcategories), { status: 200 });
}

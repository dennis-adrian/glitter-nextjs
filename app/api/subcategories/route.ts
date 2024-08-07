import { fetchSubcategories } from "@/app/lib/subcategories/actions";

export async function GET() {
  const subcategories = await fetchSubcategories();
  return new Response(JSON.stringify(subcategories), { status: 200 });
}

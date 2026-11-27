import { permanentRedirect } from "next/navigation";

export default function LegacySubcategoriesPage() {
  permanentRedirect("/dashboard/categories");
}

import { StandZone } from "@/app/api/stands/definitions";
import type { BadgeVariant } from "@/app/components/ui/badge";
import { UserCategory } from "@/app/api/users/definitions";

export function getCategoryOccupationLabel(
  category?: UserCategory | Exclude<UserCategory, "none">,
  options?: { singular?: boolean },
) {
  if (category === "illustration" || category === "new_artist")
    return options?.singular ? "Ilustrador" : "Ilustradores";
  if (category === "gastronomy") return "Gastronomía";
  if (category === "entrepreneurship")
    return options?.singular ? "Emprendedor" : "Emprendedores";
  return "Sin categoría";
}

export function getCategoryLabel(
  category: UserCategory | Exclude<UserCategory, "none">,
) {
  if (category === "illustration") return "Ilustración";
  if (category === "gastronomy") return "Gastronomía";
  if (category === "entrepreneurship") return "Emprendimiento Creativo";
  return "Sin nombre";
}

export function getPublicCategoryLabel(
  category?: UserCategory | null,
): string | null {
  if (category == null || category === "none") return null;
  if (category === "new_artist") return "Nuevos artistas";
  return getCategoryLabel(category);
}

/**
 * Categories the Badge component has a colour for. `new_artist` shares the
 * illustration palette — it has no variant of its own, and casting it straight
 * to a variant silently falls back to the default styling.
 */
export function getCategoryBadgeVariant(
  category?: UserCategory | null,
): BadgeVariant {
  if (category === "illustration" || category === "new_artist") {
    return "illustration";
  }
  if (category === "entrepreneurship") return "entrepreneurship";
  if (category === "gastronomy") return "gastronomy";
  return "outline";
}

export function getMapPageTitle(category: Exclude<UserCategory, "none">) {
  if (category === "illustration") return "Zona de Ilustradores";
  if (category === "gastronomy") return "Patio de Comidas";
  if (category === "entrepreneurship") return "Zona de Emprendedores";
  return "Sin nombre";
}

export function getMapLabel(
  category: Exclude<UserCategory, "none">,
  zone: StandZone,
) {
  if (category === "illustration") {
    if (zone === "main") return "Teatro";
  }

  if (category === "illustration") {
    if (zone === "secondary") return "Lobby";
  }

  if (category === "entrepreneurship") {
    if (zone === "main") return "Galería";
  }

  if (category === "gastronomy") {
    if (zone === "main") return "Patio";
  }

  return "Sin nombre";
}

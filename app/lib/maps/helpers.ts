import { StandZone } from "@/app/api/stands/definitions";
import { UserCategory } from "@/app/api/users/definitions";

export function getCategoryOccupationLabel(
  category?: UserCategory | Exclude<UserCategory, "none">,
  options?: { singular?: boolean },
) {
  if (category === "illustration")
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
  if (category === "entrepreneurship") return "Emprendimiento";
  return "Sin nombre";
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

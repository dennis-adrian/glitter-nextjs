import { StandZone } from "@/app/api/stands/definitions";
import { UserCategory } from "@/app/api/users/definitions";

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

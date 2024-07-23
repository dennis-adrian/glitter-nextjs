import { BaseProfile } from "@/app/api/users/definitions";

// This methods are meant to be used in both ui and sever
export function getUserName(user: BaseProfile) {
  return (
    user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim()
  );
}

export function getProfileStatusLabel(status: BaseProfile["status"]) {
  switch (status) {
    case "verified":
      return "Verificado";
    case "pending":
      return "Por verificar";
    case "rejected":
      return "Rechazado";
    case "banned":
      return "Deshabilitado";
  }
}

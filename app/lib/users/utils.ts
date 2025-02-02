import { BaseProfile } from "@/app/api/users/definitions";
import {
  faFacebook,
  faInstagram,
  faTiktok,
  faTwitter,
  faWhatsapp,
  faYoutube,
} from "@fortawesome/free-brands-svg-icons";

// This methods are meant to be used in both ui and sever
export function getUserName(user?: BaseProfile | null) {
  if (!user) return "";

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

export const socialsUrls = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  facebook: "https://www.facebook.com/",
  twitter: "https://www.twitter.com/",
  youtube: "https://www.youtube.com/",
  whatsapp: "https://wa.me/591",
};

export const socialsIcons = {
  instagram: faInstagram,
  tiktok: faTiktok,
  facebook: faFacebook,
  twitter: faTwitter,
  youtube: faYoutube,
  whatsapp: faWhatsapp,
};

export const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
export const phoneRegex = new RegExp(/^\d{8}$/);

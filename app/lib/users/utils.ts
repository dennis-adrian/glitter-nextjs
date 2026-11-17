import { BaseProfile, UserSocial } from "@/app/api/users/definitions";
import { BRAND_ICONS } from "@/app/components/brand-icon";

// This methods are meant to be used in both ui and sever
export function getUserName(
  user?: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null,
) {
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
    case "paused":
      return "Pausado";
  }
}

export const socialsUrls = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  facebook: "https://www.facebook.com/",
  twitter: "https://www.twitter.com/",
  youtube: "https://www.youtube.com/",
  whatsapp: "https://wa.me/",
};

export const socialMediaIcons: Record<
  UserSocial["type"],
  (props: { className?: string }) => React.ReactNode
> = BRAND_ICONS;

export const socialMediaOptions: {
  label: string;
  value: UserSocial["type"];
}[] = [
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
  { label: "Facebook", value: "facebook" },
  { label: "Twitter", value: "twitter" },
  { label: "YouTube", value: "youtube" },
];

export const usernameRegex = new RegExp(/^[a-zA-Z0-9_.-]+$/);
export const phoneRegex = new RegExp(/^\d{8}$/);

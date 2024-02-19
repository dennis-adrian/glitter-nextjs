import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ProfileType } from "@/api/users/definitions";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateOnlyToISO(date?: string | Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function isProfileComplete(profile: ProfileType) {
  if (!profile) return false;

  const socials = profile.userSocials.filter((social) => !!social.username);

  return (
    !!profile.bio &&
    !!profile.imageUrl &&
    !!profile.firstName &&
    !!profile.lastName &&
    !!profile.birthdate &&
    !!profile.phoneNumber &&
    !!profile.displayName &&
    !!profile.email &&
    socials.length > 0
  );
}

const requiredProfileFields = [
  { key: "bio", label: "Bio", isPublic: true },
  { key: "imageUrl", label: "Imagen de perfil", isPublic: true },
  { key: "firstName", label: "Nombre" },
  { key: "lastName", label: "Apellido" },
  { key: "birthdate", label: "Fecha de nacimiento" },
  { key: "phoneNumber", label: "Número de teléfono" },
  { key: "displayName", label: "Nombre de artista", isPublic: true },
  { key: "email", label: "Correo electrónico" },
] as { key: keyof ProfileType; label: string; isPublic: boolean }[];

export function getMissingProfileFields(profile: ProfileType) {
  const missingFields = [];
  const socials = profile.userSocials.filter((social) => !!social.username);

  requiredProfileFields.forEach((field) => {
    if (!profile[field.key]) missingFields.push(field);
  });

  if (socials.length === 0) {
    missingFields.push({
      key: "userSocials",
      label: "Al menos una red social",
      isPublic: true,
    });
  }

  return missingFields;
}

export const requestTypeLabels = {
  become_artist: "Ser artista",
  festival_participation: "Participar en festival",
};

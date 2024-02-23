import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ProfileType } from "@/api/users/definitions";
import { eventDiscoveryEnum, genderEnum } from "@/db/schema";

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

export const eventDiscoveryOptions = [
  { value: eventDiscoveryEnum.enumValues[0], label: "Facebook" },
  { value: eventDiscoveryEnum.enumValues[1], label: "Instagram" },
  { value: eventDiscoveryEnum.enumValues[2], label: "Tiktok" },
  { value: eventDiscoveryEnum.enumValues[3], label: "CBA" },
  { value: eventDiscoveryEnum.enumValues[4], label: "Un amigo me invitó" },
  {
    value: eventDiscoveryEnum.enumValues[5],
    label: "Un artista participante me invitó",
  },
  { value: eventDiscoveryEnum.enumValues[6], label: "Estaba de pasada" },
  { value: eventDiscoveryEnum.enumValues[7], label: "Otro" },
];

export const genderOptions = [
  { value: genderEnum.enumValues[0], label: "Masculino" },
  { value: genderEnum.enumValues[1], label: "Femenino" },
  { value: genderEnum.enumValues[2], label: "No binario" },
  { value: genderEnum.enumValues[3], label: "Otro" },
  { value: genderEnum.enumValues[4], label: "Prefiero no decir" },
];

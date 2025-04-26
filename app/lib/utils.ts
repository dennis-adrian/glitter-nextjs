import QRCode from "qrcode";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  BaseProfile,
  Participation,
  ProfileType,
} from "@/api/users/definitions";
import {
  eventDiscoveryEnum,
  genderEnum,
  invoiceStatusEnum,
  userCategoryEnum,
  userStatusEnum,
} from "@/db/schema";
import {
  getCategoryLabel,
  getCategoryOccupationLabel,
} from "@/app/lib/maps/helpers";
import { getInvoiceStatusLabel } from "@/app/lib/payments/helpers";
import { FestivalBase } from "@/app/data/festivals/definitions";
import {
  GLITTER_EMAIL_LOGO_URL,
  TWINKLER_LOGO_URL_270X80,
} from "@/app/lib/constants";
import { getProfileStatusLabel } from "@/app/lib/users/utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateOnlyToISO(date?: string | Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function generateQRCode(
  url: string,
): Promise<{ qrCodeUrl: string; error: boolean }> {
  try {
    const qrCodeUrl = await QRCode.toDataURL(url, {
      margin: 0,
      width: 200,
    });
    return {
      qrCodeUrl,
      error: false,
    };
  } catch (error) {
    console.error("Error generating QR code", error);
    return { error: true, qrCodeUrl: "" };
  }
}

export function isProfileComplete(profile?: ProfileType | null) {
  if (!profile) return false;

  const socials = profile.userSocials.filter((social) => !!social.username);
  const hasSubcategory = profile.profileSubcategories.length > 0;

  return (
    !!profile.bio &&
    !!profile.imageUrl &&
    !!profile.firstName &&
    !!profile.lastName &&
    !!profile.birthdate &&
    !!profile.phoneNumber &&
    !!profile.displayName &&
    !!profile.email &&
    !!profile.gender &&
    !!profile.state &&
    profile.category !== "none" &&
    hasSubcategory &&
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
  { key: "gender", label: "Género" },
  { key: "country", label: "País de residencia" },
] as { key: keyof ProfileType; label: string; isPublic: boolean }[];

export function getMissingProfileFieldsKeys(profile: ProfileType) {
  const missingFields: string[] = [];
  requiredProfileFields.forEach((field) => {
    if (!profile[field.key]) missingFields.push(field.key);
  });

  if (profile.userSocials.length === 0) {
    missingFields.push("userSocials");
  }

  if (profile.profileSubcategories.length === 0) {
    missingFields.push("profileSubcategories");
  }

  if (profile.category === "none") {
    missingFields.push("category");
  }

  if (
    profile.imageUrl?.includes("clerk") ||
    profile.imageUrl?.includes("edgestore")
  ) {
    missingFields.push("imageUrl");
  }

  return missingFields;
}

export function getMissingProfileFields(profile: ProfileType) {
  const missingFields = [];
  const socials = profile.userSocials.filter((social) => !!social.username);
  const subcategories = profile.profileSubcategories;

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

  if (subcategories.length === 0) {
    missingFields.push({
      key: "profileSubcategories",
      label: "Una categoría en la que participar",
      isPublic: true,
    });
  }

  if (profile.category === "none") {
    missingFields.push({
      key: "category",
      label: "Una categoría en la que participar",
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
  { value: eventDiscoveryEnum.enumValues[7], label: "La Rota Carlota" },
  { value: eventDiscoveryEnum.enumValues[8], label: "Otro" },
];

export const genderLabels = {
  [genderEnum.enumValues[0]]: "Masculino",
  [genderEnum.enumValues[1]]: "Femenino",
  [genderEnum.enumValues[2]]: "No binario",
  [genderEnum.enumValues[3]]: "Otro",
  [genderEnum.enumValues[4]]: "Prefiero no decir",
};

export const genderOptions = [
  { value: genderEnum.enumValues[0], label: "Masculino" },
  { value: genderEnum.enumValues[1], label: "Femenino" },
  { value: genderEnum.enumValues[2], label: "No binario" },
  { value: genderEnum.enumValues[3], label: "Otro" },
  { value: genderEnum.enumValues[4], label: "Prefiero no decir" },
];

export const stateOptions = [
  { value: "Beni", label: "Beni" },
  { value: "Chuquisaca", label: "Chuquisaca" },
  { value: "Cochabamba", label: "Cochabamba" },
  { value: "La Paz", label: "La Paz" },
  { value: "Oruro", label: "Oruro" },
  { value: "Pando", label: "Pando" },
  { value: "Potosí", label: "Potosí" },
  { value: "Santa Cruz", label: "Santa Cruz" },
  { value: "Tarija", label: "Tarija" },
];

export const userCategoryOptions = [
  {
    value: userCategoryEnum.enumValues[1],
    label: getCategoryOccupationLabel(userCategoryEnum.enumValues[1], {
      singular: true,
    }),
  },
  {
    value: userCategoryEnum.enumValues[2],
    label: getCategoryOccupationLabel(userCategoryEnum.enumValues[2], {
      singular: true,
    }),
  },
  {
    value: userCategoryEnum.enumValues[3],
    label: getCategoryOccupationLabel(userCategoryEnum.enumValues[3], {
      singular: true,
    }),
  },
];

export const userOccupationsLabel = [
  {
    value: userCategoryEnum.enumValues[1],
    label: getCategoryLabel(userCategoryEnum.enumValues[1]),
  },
  {
    value: userCategoryEnum.enumValues[2],
    label: getCategoryLabel(userCategoryEnum.enumValues[2]),
  },
  {
    value: userCategoryEnum.enumValues[3],
    label: getCategoryLabel(userCategoryEnum.enumValues[3]),
  },
];

export const invoiceStatusOptions = [
  {
    value: invoiceStatusEnum.enumValues[0],
    label: getInvoiceStatusLabel(invoiceStatusEnum.enumValues[0]),
  },
  {
    value: invoiceStatusEnum.enumValues[1],
    label: getInvoiceStatusLabel(invoiceStatusEnum.enumValues[1]),
  },
  {
    value: invoiceStatusEnum.enumValues[2],
    label: getInvoiceStatusLabel(invoiceStatusEnum.enumValues[2]),
  },
];

export const profileStatusOptions = [
  {
    value: userStatusEnum.enumValues[0],
    label: getProfileStatusLabel(userStatusEnum.enumValues[0]),
  },
  {
    value: userStatusEnum.enumValues[1],
    label: getProfileStatusLabel(userStatusEnum.enumValues[1]),
  },
  {
    value: userStatusEnum.enumValues[2],
    label: getProfileStatusLabel(userStatusEnum.enumValues[2]),
  },
  {
    value: userStatusEnum.enumValues[3],
    label: getProfileStatusLabel(userStatusEnum.enumValues[3]),
  },
];

export function getFestivalLogo(festivalType: FestivalBase["festivalType"]) {
  if (festivalType === "twinkler") {
    return TWINKLER_LOGO_URL_270X80;
  }

  return GLITTER_EMAIL_LOGO_URL;
}

export function isNewProfile(
  profile: BaseProfile & { participations: Participation[] },
) {
  const confirmedParticipations = profile.participations.filter(
    (participation) => participation.reservation.status === "accepted",
  );

  // if the user has 1 participation, we consider it as a new profile
  // until they get a second confirmed participation
  return confirmedParticipations.length < 2;
}

export function truncateText(
  text: string,
  maxLength: number,
  type: "email" | "text" = "text",
) {
  if (type === "email") {
    const [mainText, domain] = text.split("@");
    if (mainText.length <= maxLength - domain.length - 1) return text;
    return (
      mainText.slice(0, maxLength - domain.length - 1) + "..." + "@" + domain
    );
  }

  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function isNoNavigationPage(pathname?: string | null) {
  if (!pathname) return false;

  return (
    (pathname.includes("festivals") && pathname.includes("registration")) ||
    pathname.includes("sign_in") ||
    pathname.includes("sign_up")
  );
}

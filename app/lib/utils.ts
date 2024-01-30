import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { UserProfileWithRequests } from "../api/users/actions";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateOnlyToISO(date?: string | Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function isProfileComplete(profile: UserProfileWithRequests) {
  if (!profile) return false;

  return (
    !!profile.bio &&
    !!profile.imageUrl &&
    !!profile.firstName &&
    !!profile.lastName &&
    !!profile.birthdate &&
    !!profile.phoneNumber &&
    !!profile.displayName &&
    !!profile.email
  );
}

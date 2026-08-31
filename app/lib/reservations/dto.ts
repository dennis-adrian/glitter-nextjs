import type { ReservationErrorCode } from "@/app/lib/reservations/errors";

export type PublicProfileSummaryDto = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
  bio: string | null;
  userSocials: Array<{
    id: number;
    type: "instagram" | "facebook" | "twitter" | "tiktok" | "youtube";
    username: string;
  }>;
};

export type PartnerSearchResultDto = {
  id: number;
  displayName: string | null;
  imageUrl: string | null;
  selectable: boolean;
  denialCode?: ReservationErrorCode;
};

export type ReservationStandRefDto = {
  id: number;
  stand: {
    id: number;
    label: string | null;
    standNumber: number;
  };
  participants: Array<{ userId: number }>;
};

export const PUBLIC_USER_COLUMNS = {
  id: true,
  displayName: true,
  imageUrl: true,
  bio: true,
} as const;

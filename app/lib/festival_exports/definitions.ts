import { SectorTemplate } from "@/app/lib/map_templates/definitions";

// Festival basic info template (excludes image URLs and identity fields)
export interface FestivalInfoTemplate {
  name: string;
  description: string | null;
  address: string | null;
  locationLabel: string | null;
  locationUrl: string | null;
  festivalType: "glitter" | "twinkler" | "festicker";
  mapsVersion: "v1" | "v2" | "v3";
  publicRegistration: boolean;
  eventDayRegistration: boolean;
  festivalCode: string | null;
  dates: Array<{
    startDate: string; // ISO datetime
    endDate: string; // ISO datetime
  }>;
  /** Minutes a stand stays held while a participant books it. Since 2.1. */
  reservationHoldMinutes?: number;
  /**
   * Paid reservation features (full table, late partner, reservation release)
   * with their credit prices. Since 2.1.
   */
  reservationFeatures?: ReservationFeatureTemplate[];
}

export interface ReservationFeatureTemplate {
  type: "full_table" | "late_partner" | "reservation_release";
  /** Only full_table is scoped to a category; the rest are festival-wide. */
  category: "illustration" | "entrepreneurship" | null;
  enabled: boolean;
  creditPrice: number;
  /** Only late_partner has one. ISO datetime. */
  deadlineOverrideAt: string | null;
}

export interface FestivalExportMetadata {
  name: string;
  description?: string;
  createdAt: string;
  createdFrom?: {
    festivalId: number;
    festivalName: string;
  };
  exportOptions?: {
    includeBasicInfo: boolean;
    includeSectors: boolean;
  };
}

// Full festival export structure. 2.1 adds reservation features, per-stand
// individual/shared pricing, subcategories and stand groups (full tables).
export interface FestivalExport {
  version: "2.0" | "2.1";
  metadata: FestivalExportMetadata;
  festival?: FestivalInfoTemplate;
  sectors?: SectorTemplate[];
}

export interface ExportFestivalDataOptions {
  includeBasicInfo: boolean;
  includeSectors: boolean;
  sectorIds?: number[];
}

export interface ImportFestivalDataOptions {
  importBasicInfo: boolean;
  importSectors: boolean;
  sectorImportMode: "replace" | "create_only";
  nameOverride?: string;
}

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

// Full festival export structure (v2.0)
export interface FestivalExport {
  version: "2.0";
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

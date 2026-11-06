// Stand template - represents a single stand in a template
export interface StandTemplate {
  label: string | null;
  standNumber: number;
  standCategory:
    | "none"
    | "illustration"
    | "gastronomy"
    | "entrepreneurship"
    | "new_artist";
  zone: "main" | "secondary";
  orientation: "portrait" | "landscape";
  width: number | null;
  height: number | null;
  positionLeft: number;
  positionTop: number;
  /**
   * The legacy single price. Older files carry only this, and it maps to the
   * individual price on import; newer files keep it equal to
   * `individualPrice`.
   */
  price: number;
  /** Total for one registered participant. Falls back to `price`. */
  individualPrice?: number;
  /** Total for owner plus one partner; null where there is no shared option. */
  sharedPrice?: number | null;
  participationType?: "standard" | "live_activity";
  /**
   * Matched by category and label on import, since ids differ between
   * databases. A subcategory the target does not have is skipped.
   */
  subcategories?: Array<{
    category: StandTemplate["standCategory"];
    label: string;
  }>;
}

/**
 * Stands that belong together, by their position in the sector's `stands`
 * list. A `full_table` group pairs exactly two stands into one table and
 * carries what booking the whole table costs.
 */
export interface StandGroupTemplate {
  type: "visual_group" | "full_table";
  fullTablePrice: number | null;
  standIndexes: number[];
}

// Map element template - represents a signaling element in a template
export interface MapElementTemplate {
  type:
    | "entrance"
    | "stage"
    | "door"
    | "bathroom"
    | "label"
    | "custom"
    | "stairs";
  label: string | null;
  labelPosition?: "left" | "right" | "top" | "bottom";
  labelFontSize?: number;
  showIcon?: boolean;
  labelFontWeight?: number;
  rotation?: number;
  positionLeft: number;
  positionTop: number;
  width: number;
  height: number;
}

// Sector template - represents a sector with its stands
export interface SectorTemplate {
  name: string;
  description: string | null;
  orderInFestival: number;
  mapBounds: {
    originX: number | null;
    originY: number | null;
    width: number | null;
    height: number | null;
  };
  stands: StandTemplate[];
  elements?: MapElementTemplate[];
  groups?: StandGroupTemplate[];
}

// Full map template structure
export interface MapTemplate {
  /** 1.2 adds per-stand pricing, subcategories and stand groups. */
  version: "1.0" | "1.1" | "1.2";
  metadata: {
    name: string;
    description?: string;
    createdAt: string;
    createdFrom?: {
      festivalId: number;
      festivalName: string;
    };
  };
  sectors: SectorTemplate[];
}

// Database record type for saved templates
export interface MapTemplateRecord {
  id: number;
  name: string;
  description: string | null;
  templateData: MapTemplate;
  createdByUserId: number | null;
  createdFromFestivalId: number | null;
  updatedAt: Date;
  createdAt: Date;
}

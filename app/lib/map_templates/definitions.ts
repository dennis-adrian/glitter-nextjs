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
  price: number;
}

// Map element template - represents a signaling element in a template
export interface MapElementTemplate {
  type: "entrance" | "stage" | "door" | "bathroom" | "label" | "custom" | "stairs";
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
}

// Full map template structure
export interface MapTemplate {
  version: "1.0" | "1.1";
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

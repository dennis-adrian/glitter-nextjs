import { mapElements } from "@/db/schema";

export type MapElementBase = typeof mapElements.$inferSelect;
export type MapElementType = MapElementBase["type"];
export type MapElementLabelPosition = MapElementBase["labelPosition"];

export type MapElementTypeConfig = {
	type: MapElementType;
	label: string;
	defaultLabel: string | null;
	defaultWidth: number;
	defaultHeight: number;
	fillColor: string;
	strokeColor: string;
};

export const MAP_ELEMENT_TYPES: Record<MapElementType, MapElementTypeConfig> = {
	entrance: {
		type: "entrance",
		label: "Entrada",
		defaultLabel: null,
		defaultWidth: 8,
		defaultHeight: 4,
		fillColor: "rgba(59, 130, 246, 0.8)",
		strokeColor: "rgba(37, 99, 235, 0.95)",
	},
	stage: {
		type: "stage",
		label: "Escenario",
		defaultLabel: "Escenario",
		defaultWidth: 20,
		defaultHeight: 10,
		fillColor: "rgba(168, 85, 247, 0.8)",
		strokeColor: "rgba(126, 34, 206, 0.95)",
	},
	door: {
		type: "door",
		label: "Paso",
		defaultLabel: null,
		defaultWidth: 6,
		defaultHeight: 4,
		fillColor: "rgba(20, 184, 166, 0.8)",
		strokeColor: "rgba(13, 148, 136, 0.95)",
	},
	bathroom: {
		type: "bathroom",
		label: "Baño",
		defaultLabel: null,
		defaultWidth: 6,
		defaultHeight: 6,
		fillColor: "rgba(13, 148, 136, 0.85)",
		strokeColor: "rgba(15, 118, 110, 0.95)",
	},
	label: {
		type: "label",
		label: "Etiqueta",
		defaultLabel: "Texto",
		defaultWidth: 10,
		defaultHeight: 4,
		fillColor: "rgba(107, 114, 128, 0.15)",
		strokeColor: "rgba(107, 114, 128, 0.4)",
	},
	custom: {
		type: "custom",
		label: "Personalizado",
		defaultLabel: null,
		defaultWidth: 8,
		defaultHeight: 8,
		fillColor: "rgba(245, 158, 11, 0.8)",
		strokeColor: "rgba(217, 119, 6, 0.95)",
	},
	stairs: {
		type: "stairs",
		label: "Escaleras",
		defaultLabel: null,
		defaultWidth: 6,
		defaultHeight: 6,
		fillColor: "rgba(139, 92, 246, 0.85)",
		strokeColor: "rgba(109, 40, 217, 0.95)",
	},
};

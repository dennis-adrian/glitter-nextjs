import { MicIcon, Music2Icon, SparklesIcon } from "lucide-react";

export type Category = "music" | "dance" | "talk";

export const CATEGORIES: Category[] = ["music", "dance", "talk"];

export const CATEGORY_CONFIG: Record<
	Category,
	{
		icon: React.ElementType;
		title: string;
		subtitle: string;
		actNameLabel: string;
		actNamePlaceholder: string;
		actNameRequired: boolean;
		descriptionLabel: string;
		descriptionPlaceholder: string;
		descriptionRequired: boolean;
		resourceLinkLabel: string;
		resourceLinkDescription: string;
	}
> = {
	music: {
		icon: Music2Icon,
		title: "Música",
		subtitle: "Grupos, duos o solistas en formato acústico",
		actNameLabel: "Nombre artístico",
		actNamePlaceholder: "Ej: Glitter Duo",
		actNameRequired: true,
		descriptionLabel: "Descripción de la presentación",
		descriptionPlaceholder:
			"Menciona tu estilo musical, experiencia previa, etc.",
		descriptionRequired: false,
		resourceLinkLabel: "Enlace de video (Google Drive, Instagram, etc.)",
		resourceLinkDescription:
			"Este enlace debe ser a un video con el que podamos evaluar si tu presentación es adecuada para el festival.",
	},
	dance: {
		icon: SparklesIcon,
		title: "Baile",
		subtitle: "Grupos de baile o presentaciones solistas",
		actNameLabel: "Nombre artístico del grupo o solista",
		actNamePlaceholder: "Ej: La Danza de Theo",
		actNameRequired: true,
		descriptionLabel: "Descripción de la presentación",
		descriptionPlaceholder:
			"Contanos sobre el género musical de la presentación, experiencia previa, etc.",
		descriptionRequired: true,
		resourceLinkLabel: "Enlace de video (Google Drive, Instagram, etc.)",
		resourceLinkDescription:
			"Este enlace debe ser a un video con el que podamos evaluar si tu presentación es adecuada para el festival.",
	},
	talk: {
		icon: MicIcon,
		title: "Charla",
		subtitle: "Presentaciones o charlas",
		actNameLabel: "Nombre del expositor o del tema de la presentación",
		actNamePlaceholder:
			"Ej: Juan Pérez, La ciencia de la ilustración artística",
		actNameRequired: true,
		descriptionLabel: "Descripción de la presentación",
		descriptionPlaceholder:
			"Breve resumen de la presentación, temas a tratar, etc.",
		descriptionRequired: true,
		resourceLinkLabel: "Enlace al documento (Google Drive, etc.)",
		resourceLinkDescription:
			"Compartí el contenido o estructura de tu charla para que podamos evaluar tu postulación.",
	},
};

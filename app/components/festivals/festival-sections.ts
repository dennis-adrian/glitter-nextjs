import {
  BookMarkedIcon,
  HandshakeIcon,
  LayoutGridIcon,
  MailCheckIcon,
  MapIcon,
  MapPinnedIcon,
  ScanLineIcon,
  StickerIcon,
  TagsIcon,
  TicketIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { FestivalBase } from "@/app/lib/festivals/definitions";

export type FestivalSectionGroup = "visitors" | "participants" | "spaces";

export type FestivalSection = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: FestivalSectionGroup;
  path: string;
  /** Only useful while the festival is happening (e.g. door check-in). */
  activeOnly?: boolean;
};

export const FESTIVAL_SECTION_GROUP_LABELS: Record<
  FestivalSectionGroup,
  string
> = {
  visitors: "Público",
  participants: "Participantes",
  spaces: "Espacios",
};

/**
 * Every admin page under a festival, named once so the festivals list menu and
 * the festival page say the same thing for the same place.
 */
export const FESTIVAL_SECTIONS: readonly FestivalSection[] = [
  {
    key: "tickets",
    label: "Entradas",
    description: "Visitantes acreditados y estadísticas",
    icon: TicketIcon,
    group: "visitors",
    path: "tickets",
  },
  {
    key: "verification",
    label: "Verificar entradas",
    description: "Control de ingreso en puerta",
    icon: ScanLineIcon,
    group: "visitors",
    path: "tickets/verification",
    activeOnly: true,
  },
  {
    key: "activities",
    label: "Actividades",
    description: "Pasaportes, cupones y concursos",
    icon: StickerIcon,
    group: "visitors",
    path: "festival_activities",
  },
  {
    key: "participants",
    label: "Participantes",
    description: "Inscritos en el festival",
    icon: UsersIcon,
    group: "participants",
    path: "participants",
  },
  {
    key: "reservations",
    label: "Reservas y cobros",
    description: "Espacios reservados y sus pagos",
    icon: BookMarkedIcon,
    group: "participants",
    path: "reservations",
  },
  {
    key: "collaborators",
    label: "Colaboradores",
    description: "Equipo registrado por los participantes",
    icon: HandshakeIcon,
    group: "participants",
    path: "collaborators",
  },
  {
    key: "allowed-participants",
    label: "Participantes habilitados",
    description: "Reenviar la invitación por grupos",
    icon: MailCheckIcon,
    group: "participants",
    path: "allowed_participants",
  },
  {
    key: "map",
    label: "Mapa",
    description: "Ocupación de los espacios",
    icon: MapIcon,
    group: "spaces",
    path: "map",
  },
  {
    key: "stands",
    label: "Editor del mapa",
    description: "Ubicación y datos de cada espacio",
    icon: MapPinnedIcon,
    group: "spaces",
    path: "stands",
  },
  {
    key: "stands-manage",
    label: "Gestionar espacios",
    description: "Mesas completas y disponibilidad",
    icon: LayoutGridIcon,
    group: "spaces",
    path: "stands/manage",
  },
  {
    key: "stands-subcategories",
    label: "Subcategorías",
    description: "Quién puede ver cada espacio",
    icon: TagsIcon,
    group: "spaces",
    path: "stands/subcategories",
  },
];

export function festivalSectionHref(festivalId: number, section: FestivalSection) {
  return `/dashboard/festivals/${festivalId}/${section.path}`;
}

export function visibleFestivalSections(status: FestivalBase["status"]) {
  return FESTIVAL_SECTIONS.filter(
    (section) => !section.activeOnly || status === "active",
  );
}

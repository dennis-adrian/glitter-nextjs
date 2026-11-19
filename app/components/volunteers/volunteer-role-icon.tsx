import {
  CameraIcon,
  IdCardIcon,
  MapPinIcon,
  PencilIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Roles are rows an admin can rename, so the icon is matched on words in the
 * name rather than on an id; an unknown role gets a neutral one.
 */
const ROLE_ICONS: { pattern: RegExp; icon: LucideIcon }[] = [
  { pattern: /acredita|check-?in/i, icon: IdCardIcon },
  { pattern: /orienta/i, icon: MapPinIcon },
  { pattern: /exposit/i, icon: UsersIcon },
  { pattern: /montaje|desmontaje/i, icon: WrenchIcon },
  { pattern: /foto|redes/i, icon: CameraIcon },
  { pattern: /actividad|taller/i, icon: PencilIcon },
];

export function volunteerRoleIcon(name: string): LucideIcon {
  return (
    ROLE_ICONS.find(({ pattern }) => pattern.test(name))?.icon ?? SparklesIcon
  );
}

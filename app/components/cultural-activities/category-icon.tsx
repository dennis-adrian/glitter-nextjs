import {
  FootprintsIcon,
  GuitarIcon,
  LightbulbIcon,
  type LucideProps,
  PaletteIcon,
  PresentationIcon,
} from "lucide-react";

import type { LiveActCategory } from "@/app/lib/live_acts/definitions";

const ICONS: Record<LiveActCategory, React.ComponentType<LucideProps>> = {
  music: GuitarIcon,
  dance: FootprintsIcon,
  talk: PresentationIcon,
  workshop: PaletteIcon,
  other: LightbulbIcon,
};

/** Decorative: the category's name is always beside it. */
export default function CulturalActivityCategoryIcon({
  category,
  ...props
}: { category: LiveActCategory } & LucideProps) {
  const Icon = ICONS[category];
  return <Icon aria-hidden {...props} />;
}

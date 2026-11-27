import type { Metadata } from "next";

import CulturalActivitiesLanding from "@/app/components/cultural-activities/cultural-activities-landing";
import {
  CULTURAL_ACTIVITIES_PATH,
  CULTURAL_ACTIVITY_COPY,
} from "@/app/lib/live_acts/definitions";

const TITLE = CULTURAL_ACTIVITY_COPY.title;
const DESCRIPTION = CULTURAL_ACTIVITY_COPY.metaDescription;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CULTURAL_ACTIVITIES_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CULTURAL_ACTIVITIES_PATH,
    type: "website",
    locale: "es_BO",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The public call for cultural activities (music, dance, talks, workshops,
 * other). The form lives on /actividades-culturales/postular.
 */
export default function CulturalActivitiesPage() {
  return <CulturalActivitiesLanding />;
}

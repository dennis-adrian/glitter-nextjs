import { ImageResponse } from "next/og";

import { CULTURAL_ACTIVITY_COPY } from "@/app/lib/live_acts/definitions";

/**
 * The link preview for /actividades-culturales (Instagram, WhatsApp). Static
 * copy only, so it renders without the database.
 */
export const alt = CULTURAL_ACTIVITY_COPY.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function CulturalActivitiesOpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background:
          "linear-gradient(135deg, #2a1650 0%, #6d28d9 55%, #ec4899 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 40, opacity: 0.9 }}>Productora Glitter</div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1.05,
          marginTop: 24,
        }}
      >
        {CULTURAL_ACTIVITY_COPY.title}
      </div>
      <div style={{ fontSize: 40, marginTop: 32, opacity: 0.95 }}>
        {CULTURAL_ACTIVITY_COPY.ogSubtitle}
      </div>
    </div>,
    size,
  );
}

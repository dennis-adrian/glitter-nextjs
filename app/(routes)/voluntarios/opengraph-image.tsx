import { ImageResponse } from "next/og";

/**
 * The link preview for /voluntarios (Instagram, WhatsApp). Static copy only,
 * so it renders without the database. Placeholder art until the mockups land.
 */
export const alt = "Sé voluntario/a en Glitter";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function VolunteersOpenGraphImage() {
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
        Sé voluntario/a en Glitter
      </div>
      <div style={{ fontSize: 40, marginTop: 32, opacity: 0.95 }}>
        Elige tus turnos y tu rol · Postúlate
      </div>
    </div>,
    size,
  );
}

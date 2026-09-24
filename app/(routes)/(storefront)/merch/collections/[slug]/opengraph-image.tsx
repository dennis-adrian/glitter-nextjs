import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { fetchPublicMerchCollection } from "@/app/lib/merch/collections";
import { isAllowedProgramArtworkUrl } from "@/app/lib/programs/artwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Colección de merch de Glitter";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const localMimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

async function artworkDataUrl(imageUrl: string | null | undefined) {
  if (!isAllowedProgramArtworkUrl(imageUrl)) return null;

  try {
    if (imageUrl.startsWith("/img/")) {
      const pathname = decodeURIComponent(
        new URL(imageUrl, "https://glitter.invalid").pathname,
      );
      const imageRoot = resolve(process.cwd(), "public/img");
      const filePath = resolve(process.cwd(), `public${pathname}`);
      if (!filePath.startsWith(`${imageRoot}${sep}`)) return null;
      const mimeType = localMimeTypes[extname(filePath).toLowerCase()];
      if (!mimeType) return null;
      const data = await readFile(filePath, "base64");
      return `data:${mimeType};base64,${data}`;
    }

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0];
    if (!mimeType?.startsWith("image/")) return null;
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${mimeType};base64,${data}`;
  } catch {
    return null;
  }
}

export default async function CollectionOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await fetchPublicMerchCollection(slug);
  if (!collection) notFound();

  const title =
    collection.name.length > 64
      ? `${collection.name.slice(0, 61).trimEnd()}…`
      : collection.name;
  const rawDescription =
    collection.description || "Merch oficial de Productora Glitter";
  const description =
    rawDescription.length > 110
      ? `${rawDescription.slice(0, 107).trimEnd()}…`
      : rawDescription;

  // A collection with a campaign banner shares that banner, laid out like the
  // storefront hero: the art cropped from the left, the copy over its empty
  // side in the tone the admin chose.
  const banner = await artworkDataUrl(collection.campaignImageUrl);
  if (banner) {
    const light = collection.campaignTextTone === "light";
    return new ImageResponse(
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: light ? "#29005c" : "#ffffff",
        }}
      >
        <img
          src={banner}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "right",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundImage: light
              ? "linear-gradient(to right, rgba(0,0,0,0.9), rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 70%)"
              : "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0.6) 45%, rgba(255,255,255,0) 70%)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "relative",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 600,
            height: "100%",
            padding: "58px 60px",
            color: light ? "#ffffff" : "#29005c",
          }}
        >
          <div style={{ display: "flex", fontSize: 25, fontWeight: 700 }}>
            GLITTER · MERCH
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: title.length > 38 ? 52 : 64,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.04em",
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 25,
                lineHeight: 1.3,
                opacity: 0.85,
              }}
            >
              {description}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 20, opacity: 0.8 }}>
            productoraglitter.com
          </div>
        </div>
      </div>,
      size,
    );
  }

  const artwork = await artworkDataUrl(collection.imageUrl);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: "#eae2ff",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 535,
          height: "100%",
          padding: "58px 52px",
          backgroundColor: "#29005c",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 25, fontWeight: 700 }}>
          GLITTER · MERCH
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 38 ? 52 : 64,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.3,
              color: "#eae2ff",
            }}
          >
            {description}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#d8c8ff" }}>
          productoraglitter.com
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 665,
          height: "100%",
          padding: 24,
        }}
      >
        {artwork ? (
          // ImageResponse renders images directly; next/image is unavailable here.
          <img
            src={artwork}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              color: "#5b21d8",
              fontSize: 128,
              fontWeight: 900,
            }}
          >
            GLITTER
          </div>
        )}
      </div>
    </div>,
    size,
  );
}

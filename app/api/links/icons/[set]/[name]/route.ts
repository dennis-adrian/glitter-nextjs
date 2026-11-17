import { libraryIconSvg } from "@/app/lib/links/icon-library";

/**
 * One icon of the Lucide or Simple Icons library, as an SVG file. The
 * dashboard's picker shows its search results from here, so the libraries
 * stay out of the browser. Public: it serves only what the two open
 * libraries publish, and the name is looked up in them, never read as a path.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ set: string; name: string }> },
) {
  const { set, name } = await context.params;
  const svg = await libraryIconSvg(`${set}:${name}`);
  if (!svg) return new Response(null, { status: 404 });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // An icon's drawing changes only with a library upgrade.
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

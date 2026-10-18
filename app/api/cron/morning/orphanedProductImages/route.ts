import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";
import { handleOrphanedProductImages } from "@/app/lib/products/scheduled-actions";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const deleted = await handleOrphanedProductImages();
    return new Response(JSON.stringify({ deleted }), { status: 200 });
  } catch (error) {
    console.error("Error cleaning up orphaned product images", error);
    return new Response(
      JSON.stringify({ error: "Error cleaning up orphaned product images" }),
      { status: 500 },
    );
  }
}

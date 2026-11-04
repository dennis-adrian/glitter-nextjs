import { getViewerClerkId } from "@/app/lib/impersonation/viewer";
import { cachedFetchNavbarProfileByClerkId } from "@/app/lib/users/navbar-profile";

export async function GET() {
  // The participant's while an admin views the app as them.
  const clerkId = await getViewerClerkId();

  if (!clerkId) {
    return Response.json(null);
  }

  try {
    const profile = await cachedFetchNavbarProfileByClerkId(clerkId);
    return Response.json(profile);
  } catch (error) {
    console.error("Failed to fetch navbar profile:", error);
    return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

import { cachedFetchNavbarProfileByClerkId } from "@/app/lib/users/actions";
import { currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const user = await currentUser();

  if (!user) {
    return Response.json(null);
  }

  try {
    const profile = await cachedFetchNavbarProfileByClerkId(user.id);
    return Response.json(profile);
  } catch (error) {
    console.error("Failed to fetch navbar profile:", error);
    return Response.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

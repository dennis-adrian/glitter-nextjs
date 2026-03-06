import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/my_profile(.*)",
  "/my_participations(.*)",
  "/my_history(.*)",
  "/my_orders(.*)",
  "/profiles(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (req.method === "OPTIONS") return NextResponse.next();
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};

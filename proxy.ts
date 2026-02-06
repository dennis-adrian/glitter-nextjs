import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/user_profile(.*)",
  "/my_profile(.*)",
  "/profiles(.*)",
  "/profile_verification(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Only run middleware on protected routes and API routes.
    // Public pages (home, festivals, etc.) are excluded so Clerk's
    // dev-mode URL-based session sync does not trigger redirect loops.
    "/dashboard(.*)",
    "/user_profile(.*)",
    "/my_profile(.*)",
    "/profiles(.*)",
    "/profile_verification(.*)",
    "/(api|trpc)(.*)",
  ],
};

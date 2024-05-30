import { clerkMiddleware } from "@clerk/nextjs/server";

// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
// See https://clerk.com/docs/references/nextjs/auth-middleware for more information about configuring your Middleware
export default clerkMiddleware({
  // ignoredRoutes: ["/api/edgestore/init", "/api/send"],
  // publicRoutes: [
  //   "/",
  //   "/next_event",
  //   "/festivals(.*)",
  //   "/profiles(.*)",
  //   "/api/uploadthing(.*)",
  // ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};

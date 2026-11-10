import Footer from "@/app/components/footer";
import {
  getLayoutViewer,
  isLayoutFeatureEnabled,
} from "@/app/lib/feature_flags/helpers";

/**
 * Resolves the footer's feature flags and viewer server-side.
 *
 * The footer itself is a client component (it reads the pathname), and the
 * root layout is synchronous on purpose — awaiting a flag there would block
 * the whole page shell, navbar included, on a database round-trip. Keeping the
 * await in here leaves it inside the layout's existing Suspense boundary, the
 * same way `Navbar` wraps `NavbarClient`.
 *
 * `signedIn` is the same viewer the navbar draws the app shell for, so a
 * signed-in page arrives without the footer instead of dropping it once Clerk
 * loads. On `force-static` pages the server cannot ask, and Clerk decides.
 */
export default async function FooterServer() {
  const [blogEnabled, viewer] = await Promise.all([
    isLayoutFeatureEnabled("blog"),
    getLayoutViewer(),
  ]);

  return <Footer blogEnabled={blogEnabled} signedIn={viewer != null} />;
}

import Footer from "@/app/components/footer";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";

/**
 * Resolves the footer's feature flags server-side.
 *
 * The footer itself is a client component (it reads the pathname), and the
 * root layout is synchronous on purpose — awaiting a flag there would block
 * the whole page shell, navbar included, on a database round-trip. Keeping the
 * await in here leaves it inside the layout's existing Suspense boundary, the
 * same way `Navbar` wraps `NavbarClient`.
 */
export default async function FooterServer() {
  const blogEnabled = await isFeatureEnabled("blog");

  return <Footer blogEnabled={blogEnabled} />;
}

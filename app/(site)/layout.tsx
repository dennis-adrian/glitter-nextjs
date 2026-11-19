import SiteChrome from "@/app/components/site-chrome";

/** Every page of the site but `/links`, which stands alone. */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteChrome>{children}</SiteChrome>;
}

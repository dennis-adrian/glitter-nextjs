import StoreLayoutShell from "@/app/components/organisms/store/store-layout-shell";

export const dynamic = "force-dynamic";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StoreLayoutShell>{children}</StoreLayoutShell>;
}

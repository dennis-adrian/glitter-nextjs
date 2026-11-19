import StoreLayoutShell from "@/app/components/organisms/store/store-layout-shell";

export const dynamic = "force-dynamic";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StoreLayoutShell>{children}</StoreLayoutShell>;
}

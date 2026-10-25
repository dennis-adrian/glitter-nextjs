import CommunicationsNav from "@/app/components/communications/admin/communications-nav";
import { requireCommunicationsAdmin } from "@/app/lib/communications/access";

export default async function CommunicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // So nobody else sees even the heading around the 404. Each page checks
  // again: a layout is not a boundary.
  await requireCommunicationsAdmin();

  return (
    // Fills the dashboard's viewport-tall shell, as the credits area does.
    <div className="container flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 md:px-6 md:py-4">
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl">Comunicaciones</h1>
          <p className="text-sm text-muted-foreground">
            Anuncios para participantes y las listas a las que se envían.
          </p>
        </div>
        <CommunicationsNav />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

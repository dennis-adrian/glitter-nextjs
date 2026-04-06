import { RedirectButton } from "@/app/components/redirect-button";
import TicketsNavTabs from "@/app/components/tickets/tickets-nav-tabs";

export default async function TicketsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseInt(params.id);

  return (
    <div className="container min-h-full p-4 md:px-6">
      <div className="my-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold md:text-3xl">Entradas</h1>
        <RedirectButton href={`/festivals/${festivalId}/registration`}>
          Nueva entrada
        </RedirectButton>
      </div>
      <TicketsNavTabs festivalId={festivalId} />
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

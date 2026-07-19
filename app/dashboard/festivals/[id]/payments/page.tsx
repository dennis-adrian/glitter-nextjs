import PaymentsTable from "@/app/components/payments/table";
import { fetchInvoicesByFestival } from "@/app/data/invoices/actions";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function PaymentsPage(props: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);

  if (!validatedParams.success) {
    return notFound();
  }

  const [invoices, profile] = await Promise.all([
    fetchInvoicesByFestival(validatedParams.data.id),
    getCurrentUserProfile(),
  ]);
  const isAdmin = profile?.role === "admin";

  return (
    <div className="container p-4 md:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/festivals">
              Festivales
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Pagos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="my-2 text-2xl font-bold md:text-3xl">Pagos</h1>
      <Tabs defaultValue="all" className="my-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="paid">Pagados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelados</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <PaymentsTable invoices={invoices} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="paid">
          <PaymentsTable invoices={invoices} status="paid" isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="pending">
          <PaymentsTable
            invoices={invoices}
            status="pending"
            isAdmin={isAdmin}
          />
        </TabsContent>
        <TabsContent value="cancelled">
          <PaymentsTable
            invoices={invoices}
            status="cancelled"
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

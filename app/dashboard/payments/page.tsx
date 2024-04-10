import PaymentsTable from "@/app/components/payments/table";
import { fetchInvoices } from "@/app/data/invoices/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function Page() {
  const invoices = await fetchInvoices();

  return (
    <div className="container p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Pagos</h1>
      <Tabs defaultValue="all" className="my-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="paid">Pagados</TabsTrigger>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <PaymentsTable invoices={invoices} />
        </TabsContent>
        <TabsContent value="paid">
          <PaymentsTable invoices={invoices} status="paid" />
        </TabsContent>
        <TabsContent value="pending">
          <PaymentsTable invoices={invoices} status="pending" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

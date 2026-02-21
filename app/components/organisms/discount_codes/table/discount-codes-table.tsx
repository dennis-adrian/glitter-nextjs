import { columns, columnTitles } from "./columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { fetchDiscountCodes } from "@/app/lib/discount_codes/actions";

export default async function DiscountCodesTable() {
  const discountCodes = await fetchDiscountCodes();

  return (
    <DataTable
      columns={columns}
      data={discountCodes}
      columnTitles={columnTitles}
      filters={[]}
    />
  );
}

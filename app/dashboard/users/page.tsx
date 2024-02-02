import { fetchProfiles } from "@/app/api/users/actions";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export default async function DemoPage() {
  const users = await fetchProfiles();

  return (
    <div className="container mx-auto py-10">
      <DataTable columns={columns} data={users} />
    </div>
  );
}

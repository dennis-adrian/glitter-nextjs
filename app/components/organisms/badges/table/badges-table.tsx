import {
	columns,
	columnTitles,
} from "@/app/components/organisms/badges/table/columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { fetchBadges } from "@/app/lib/badges/actions";

export default async function BadgesTable() {
	const badges = await fetchBadges();

	return (
		<DataTable
			columns={columns}
			data={badges}
			columnTitles={columnTitles}
			filters={[]}
		/>
	);
}

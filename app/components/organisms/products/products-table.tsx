"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/products/table-columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { use } from "react";

type ProductsTableProps = {
	productsPromise: Promise<BaseProductWithImages[]>;
};

export default function ProductsTable({ productsPromise }: ProductsTableProps) {
	const products = use(productsPromise);

	return (
		<DataTable
			columns={columns}
			data={products}
			columnTitles={columnTitles}
			filters={[
				{
					columnId: "status",
					label: "Estado",
					options: [
						{ value: "available", label: "Disponible" },
						{ value: "presale", label: "Preventa" },
						{ value: "sale", label: "En oferta" },
					],
				},
			]}
		/>
	);
}

"use client";

import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@/app/components/ui/tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function StoreLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const active = pathname.startsWith("/dashboard/store/products")
		? "products"
		: "orders";

	return (
		<div className="container p-3 md:p-6 space-y-6">
			<h1 className="text-2xl font-bold">Tienda</h1>
			<Tabs value={active}>
				<TabsList>
					<TabsTrigger value="orders" asChild>
						<Link href="/dashboard/store/orders">Pedidos</Link>
					</TabsTrigger>
					<TabsTrigger value="products" asChild>
						<Link href="/dashboard/store/products">Productos</Link>
					</TabsTrigger>
				</TabsList>
			</Tabs>
			{children}
		</div>
	);
}

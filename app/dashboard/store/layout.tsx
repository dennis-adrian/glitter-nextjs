"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PackageIcon, ReceiptTextIcon, ShoppingCartIcon } from "lucide-react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import { cn } from "@/lib/utils";
import Heading from "@/app/components/atoms/heading";

const storeSections = [
	{
		value: "payments",
		label: "Pagos",
		href: "/dashboard/store/payments",
		icon: ReceiptTextIcon,
	},
	{
		value: "orders",
		label: "Pedidos",
		href: "/dashboard/store/orders",
		icon: ShoppingCartIcon,
	},
	{
		value: "products",
		label: "Productos",
		href: "/dashboard/store/products",
		icon: PackageIcon,
	},
] as const;

function getActiveStoreSection(pathname: string) {
	if (pathname.startsWith("/dashboard/store/products")) return "products";
	if (pathname.startsWith("/dashboard/store/payments")) return "payments";
	return "orders";
}

export default function StoreLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const router = useRouter();
	const active = getActiveStoreSection(pathname);

	return (
		<div className="container space-y-6 px-3 py-4 md:px-6 md:py-6">
			<div className="space-y-2">
				<Heading level={2}>Admin Tienda</Heading>
				<p className="text-muted-foreground text-sm md:text-base">
					Gestiona productos, pedidos y comprobantes de pago desde un solo
					lugar.
				</p>
			</div>

			<div className="sticky top-16 z-40 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:top-20 md:-mx-6 md:px-6">
				<div className="flex flex-col gap-3">
					<div className="md:hidden">
						<p className="mb-2 text-sm font-medium text-muted-foreground">
							Sección
						</p>
						<Select
							value={active}
							onValueChange={(value) => {
								const targetSection = storeSections.find(
									(section) => section.value === value,
								);

								if (targetSection) {
									router.push(targetSection.href);
								}
							}}
						>
							<SelectTrigger className="h-11 rounded-xl border-border/70 bg-muted/30">
								<SelectValue placeholder="Selecciona una sección" />
							</SelectTrigger>
							<SelectContent>
								{storeSections.map(({ value, label, icon: Icon }) => (
									<SelectItem key={value} value={value}>
										<span className="flex items-center gap-2">
											<Icon className="h-4 w-4" />
											{label}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<nav className="hidden rounded-2xl border border-border/70 bg-muted/30 p-1 shadow-sm md:block">
						<div className="flex flex-wrap gap-1">
							{storeSections.map(({ value, label, href, icon: Icon }) => {
								const isActive = active === value;

								return (
									<Link
										key={value}
										href={href}
										className={cn(
											"inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
											isActive
												? "bg-background text-primary shadow-sm"
												: "text-muted-foreground hover:bg-background/70 hover:text-foreground",
										)}
									>
										<Icon className="h-4 w-4" />
										{label}
									</Link>
								);
							})}
						</div>
					</nav>
				</div>
			</div>
			{children}
		</div>
	);
}

"use client";

import { ChevronRightIcon } from "lucide-react";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { CATEGORIES, CATEGORY_CONFIG, type Category } from "./category-config";

interface CategorySelectorProps {
	onSelect: (category: Category) => void;
}

export default function CategorySelector({ onSelect }: CategorySelectorProps) {
	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-sm md:text-base">
				¿Tenés música, danza o una charla para compartir con la comunidad
				Glitter? Completá el formulario y nos pondremos en contacto para que
				participés en nuestros festivales.
			</p>
			{CATEGORIES.map((cat) => {
				const config = CATEGORY_CONFIG[cat];
				const Icon = config.icon;
				return (
					<Card
						key={cat}
						className="cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						role="button"
						tabIndex={0}
						onClick={() => onSelect(cat)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect(cat);
							}
						}}
					>
						<CardHeader className="flex flex-row items-center gap-4 py-4">
							<Icon className="h-7 w-7 shrink-0 text-primary" />
							<div className="flex-1">
								<CardTitle className="text-base">{config.title}</CardTitle>
								<CardDescription>{config.subtitle}</CardDescription>
							</div>
							<ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
						</CardHeader>
					</Card>
				);
			})}
		</div>
	);
}

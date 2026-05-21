import Link from "next/link";

import { Button } from "@/app/components/ui/button";

type Props = {
	currentPage: number;
	totalPages: number;
	buildHref: (page: number) => string;
};

export default function PostPagination({
	currentPage,
	totalPages,
	buildHref,
}: Props) {
	if (totalPages <= 1) return null;

	const prev = Math.max(1, currentPage - 1);
	const next = Math.min(totalPages, currentPage + 1);

	return (
		<nav
			className="mt-10 flex items-center justify-center gap-3"
			aria-label="Paginación"
		>
			<Button
				asChild
				variant="outline"
				disabled={currentPage <= 1}
				aria-disabled={currentPage <= 1}
			>
				<Link href={buildHref(prev)}>Anterior</Link>
			</Button>
			<span className="text-sm text-muted-foreground">
				Página {currentPage} de {totalPages}
			</span>
			<Button
				asChild
				variant="outline"
				disabled={currentPage >= totalPages}
				aria-disabled={currentPage >= totalPages}
			>
				<Link href={buildHref(next)}>Siguiente</Link>
			</Button>
		</nav>
	);
}

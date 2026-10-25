import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/** Anterior / Siguiente over `?page=`, for the 50-a-page member lists. */
export default function ListMembersPagination({
  page,
  pageCount,
  basePath,
}: {
  page: number;
  pageCount: number;
  basePath: string;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) =>
    target <= 1 ? basePath : `${basePath}?page=${target}`;

  return (
    <nav
      className="flex items-center justify-end gap-3"
      aria-label="Paginación"
    >
      {page <= 1 ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Anterior
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>Anterior</Link>
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        Página {page} de {pageCount}
      </span>
      {page >= pageCount ? (
        <Button variant="outline" size="sm" disabled aria-disabled="true">
          Siguiente
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>Siguiente</Link>
        </Button>
      )}
    </nav>
  );
}

"use client";

import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

type UsersTablePaginationProps = {
  canNextPage: boolean;
  canPreviousPage: boolean;
  pageIndex: number;
  pageCount: number;
  pageSize: string;
  rowCount: number;
  total: number;
};

export default function UsersTablePagination(props: UsersTablePaginationProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const handlePageSizeChange = (pageSize: string) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.set("limit", pageSize);
    router.push(`?${currentSearchParams.toString()}`);
  };

  const handlePageIndexChange = (pageIndex: number) => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    const newOffset = (pageIndex - 1) * Number(props.pageSize);
    currentSearchParams.set("offset", newOffset.toString());
    router.push(`?${currentSearchParams.toString()}`);
  };

  return (
    <div className="flex gap-2 my-4 items-center justify-between">
      <span className="text-muted-foreground text-sm">
        Mostrando {props.rowCount} de {props.total}
      </span>
      <div className="flex items-center gap-2">
        <div className="w-fit">
          <Select value={props.pageSize} onValueChange={handlePageSizeChange}>
            <SelectTrigger>
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100, 200].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground text-sm">
          Página {props.pageIndex} de {props.pageCount}
        </span>
        <Button
          disabled={!props.canPreviousPage}
          variant="outline"
          size="icon"
          onClick={() => handlePageIndexChange(1)}
        >
          <span className="sr-only">Ir a la primera página</span>
          <ChevronsLeftIcon className="w-4 h-4" />
        </Button>
        <Button
          disabled={!props.canPreviousPage}
          variant="outline"
          size="icon"
          onClick={() => handlePageIndexChange(props.pageIndex - 1)}
        >
          <span className="sr-only">Ir a la página anterior</span>
          <ChevronLeftIcon className="w-4 h-4" />
        </Button>
        <Button
          disabled={!props.canNextPage}
          variant="outline"
          size="icon"
          onClick={() => handlePageIndexChange(props.pageIndex + 1)}
        >
          <span className="sr-only">Ir a la siguiente página</span>
          <ChevronRightIcon className="w-4 h-4" />
        </Button>
        <Button
          disabled={!props.canNextPage}
          variant="outline"
          size="icon"
          onClick={() => handlePageIndexChange(props.pageCount)}
        >
          <span className="sr-only">Ir al final</span>
          <ChevronsRightIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

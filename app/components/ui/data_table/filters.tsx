import { FilterIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/app/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

type DataTableFilterProps = {
  children: ReactNode;
};

export const DataTableFilters: React.FC<DataTableFilterProps> = ({
  children,
}: DataTableFilterProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <FilterIcon className="sm:mr-2 h-4 w-4" />
          <span className="hidden sm:block">Filtros</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
};

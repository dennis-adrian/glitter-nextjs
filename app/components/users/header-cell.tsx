"use client";

import { Button } from "@/app/components/ui/button";
import { TableHead } from "@/app/components/ui/table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

type HeaderCellProps = {
  canSort?: boolean;
  value: string;
  label: string;
};
export function HeaderCell(props: HeaderCellProps) {
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const isSorted = searchParams.get("sort") === props.value;
  const isDesc = searchParams.get("direction") === "desc";

  const handleSort = () => {
    const currentSearchParams = new URLSearchParams(searchParams.toString());
    currentSearchParams.delete("sort");
    currentSearchParams.delete("direction");
    currentSearchParams.set("offset", "0");
    currentSearchParams.set("sort", props.value);
    currentSearchParams.set("direction", isDesc ? "asc" : "desc");
    replace(`?${currentSearchParams.toString()}`);
  };

  return (
    <TableHead>
      <Button variant="ghost" onClick={handleSort}>
        <span>{props.label}</span>
        {props.canSort ? (
          isSorted ? (
            isDesc ? (
              <ArrowDownIcon className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpIcon className="ml-2 h-4 w-4" />
            )
          ) : (
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          )
        ) : null}
      </Button>
    </TableHead>
  );
}

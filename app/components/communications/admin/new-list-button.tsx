"use client";

import { ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { DISTRIBUTION_LIST_KIND_DESCRIPTIONS } from "@/app/lib/distribution_lists/definitions";

export default function NewListButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" aria-hidden />
          Nueva lista
          <ChevronDownIcon className="ml-2 h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["filter", "fixed"] as const).map((kind) => (
          <DropdownMenuItem key={kind} asChild>
            <Link href={`/dashboard/communications/lists/new?kind=${kind}`}>
              {DISTRIBUTION_LIST_KIND_DESCRIPTIONS[kind]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

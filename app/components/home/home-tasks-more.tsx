"use client";

import { useId, useState } from "react";

import { ChevronDownIcon } from "lucide-react";

/**
 * The tasks past the first few, folded until asked for. The button sits under
 * the list it opens, so the list grows above it the way it reads.
 */
export default function HomeTasksMore({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <>
      <div id={listId} hidden={!open}>
        {children}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-center gap-1 border-t border-brand-border py-2.5 text-sm font-semibold text-brand-primary hover:underline"
      >
        {open ? "Ver menos" : `Ver ${count} más`}
        <ChevronDownIcon
          className={`size-4 transition-transform${open ? " rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
    </>
  );
}

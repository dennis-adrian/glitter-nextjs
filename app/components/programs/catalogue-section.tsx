import type { ReactNode } from "react";

import { cn } from "@/app/lib/utils";

type Props = {
  /** Anchors the heading, and labels the section for assistive tech. */
  id: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

/** One titled block of the public catalogue at `/programs`. */
export default function CatalogueSection({
  id,
  title,
  description,
  className,
  children,
}: Props) {
  return (
    <section aria-labelledby={id} className={cn("space-y-5", className)}>
      <div className="space-y-1">
        <h2
          id={id}
          className="font-display text-2xl font-extrabold tracking-[-0.5px] sm:text-3xl"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-brand-ink/75">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

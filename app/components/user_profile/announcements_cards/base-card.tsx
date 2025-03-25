"use client";

import { ReactNode } from "react";

import { cn } from "@/app/lib/utils";

import { Card, CardContent } from "@/components/ui/card";

export default function BaseCard({
  content,
  footer,
  className,
}: {
  className?: string;
  content: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card
      className={cn("bg-amber-50 text-amber-900 border-amber-200", className)}
    >
      <CardContent className="text-sm py-3 px-3">
        <div className="flex flex-col justify-between items-center md:flex-row gap-1 md:gap-2">
          <div>{content}</div>
          {footer}
        </div>
      </CardContent>
    </Card>
  );
}

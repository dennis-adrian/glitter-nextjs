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
      className={cn(
        "bg-gradient-to-r from-background-50/20 to-background-50",
        className,
      )}
    >
      <CardContent className="text-sm py-3 ">
        <div className="flex flex-col justify-between items-center md:flex-row gap-2">
          <div>{content}</div>
          {footer}
        </div>
      </CardContent>
    </Card>
  );
}

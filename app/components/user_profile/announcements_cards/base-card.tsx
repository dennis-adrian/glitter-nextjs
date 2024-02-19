import { cn } from "@/app/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReactNode } from "react";

export default async function BaseCard({
  title,
  content,
  footer,
  className,
}: {
  className?: string;
  title: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "text-white bg-gradient-to-r from-violet-600 to-indigo-600",
        className,
      )}
    >
      <CardHeader className="pb-3 md:pb-6">
        <CardTitle className="text-xl md:text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 text-sm md:pb-6 md:text-base">
        {content}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

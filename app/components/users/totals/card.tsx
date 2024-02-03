import { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { desc } from "drizzle-orm";

export default function TotalsCard({
  amount,
  description,
  title,
  Icon,
}: {
  amount: number;
  title: string;
  description?: string;
  Icon: LucideIcon;
}) {
  return (
    <Card className="flex-1 w-full">
      <CardHeader className="w-fullp p-6 pb-2">
        <div className="flex justify-between w-full">
          <CardTitle className="capitalize text-sm">{title}</CardTitle>
          <Icon className="w-3 h-3" />
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        <div className="p-2">
          <div className="font-bold text-2xl text-center">{amount}</div>
          <div className="text-muted-foreground text-sm text-center">
            {description}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

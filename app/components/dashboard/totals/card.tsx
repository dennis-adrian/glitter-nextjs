import { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export default function TotalsCard({
  amount,
  description,
  title,
  Icon,
}: {
  amount: number;
  title: string;
  description?: string;
  Icon?: LucideIcon;
}) {
  return (
    <div className="p-4 border rounded-lg w-full flex-1 min-w-[320px]">
      <div className="flex justify-around items-center">
        <div className="capitalize text-muted-foreground">{title}</div>
        <div className="font-bold text-xl">{amount}</div>
      </div>
    </div>
    // <Card className="w-full flex-1">
    //   <CardHeader className="w-fullp p-6 pb-2">
    //     <div className="flex w-full justify-between">
    //       <CardTitle className="text-sm capitalize">{title}</CardTitle>
    //       {Icon && <Icon className="h-3 w-3" />}
    //     </div>
    //   </CardHeader>
    //   <CardContent className="p-6 pt-2">
    //     <div className="p-2">
    //       <div className="mb-2 text-center text-2xl font-bold">{amount}</div>
    //       <div className="text-muted-foreground text-center text-sm">
    //         {description}
    //       </div>
    //     </div>
    //   </CardContent>
    // </Card>
  );
}

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { ComponentProps } from "react";

type CategoryCardProps = {
  title: string;
} & ComponentProps<"div">;
export default function CategoryCard(props: CategoryCardProps) {
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle className="text-lg">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm px-4 pb-4">
        {props.children}
      </CardContent>
    </Card>
  );
}

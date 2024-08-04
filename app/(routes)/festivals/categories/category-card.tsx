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
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="text-xl">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm px-5 pb-5">
        {props.children}
      </CardContent>
    </Card>
  );
}

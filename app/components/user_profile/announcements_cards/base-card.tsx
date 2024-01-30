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
}: {
  title: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="my-4 p-2 text-center">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-lg leading-6">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-2 text-sm">
        <p>{content}</p>
      </CardContent>
      {footer && <CardFooter className="p-3 pt-1">{footer}</CardFooter>}
    </Card>
  );
}

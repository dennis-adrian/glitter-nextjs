import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import ActivationReportKpis from "@/app/components/festivals/activation-report/activation-report-kpis";
import { buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { ActivationReport } from "@/app/lib/festivals/activation-report";
import { cn } from "@/app/lib/utils";

/**
 * The festival page's summary of its activation notice in Glitter, once it
 * went out; the list of who got it is one tap away.
 */
export default function ActivationReportCard({
  festivalId,
  report,
}: {
  festivalId: number;
  report: ActivationReport;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Invitación en Glitter</CardTitle>
        <CardDescription>
          Quiénes recibieron la notificación al activar el festival, quiénes la
          leyeron y quiénes se inscribieron.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActivationReportKpis report={report} />
        <Link
          href={`/dashboard/festivals/${festivalId}/activation_notifications`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
        >
          Ver quiénes la recibieron
          <ChevronRightIcon className="ml-auto h-4 w-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}

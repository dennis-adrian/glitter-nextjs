import ActiveFestivalForm from "@/app/components/festivals/activate-festival-form";
import FestivalStatusBadge from "@/app/components/festivals/festival-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";

export default function FestivalCard({ festival }: { festival: FestivalBase }) {
  return (
    <Card className="shadow-md my-4">
      <CardHeader>
        <CardTitle className="flex gap-2">
          {festival.name}
          <FestivalStatusBadge status={festival.status} />
        </CardTitle>
        <CardDescription>{festival.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          <strong>Fecha:</strong> {getFestivalDateLabel(festival)}
        </p>
        <p>
          <strong>Lugar:</strong> {festival.locationLabel}
        </p>
        <p>
          <strong>Ubicación:</strong> {festival.address}
        </p>
        {festival.status === "draft" && (
          <ActiveFestivalForm festival={festival} />
        )}
      </CardContent>
    </Card>
  );
}

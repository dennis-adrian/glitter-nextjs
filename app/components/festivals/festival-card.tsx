import {
  ArchiveIcon,
  BuildingIcon,
  CalendarDaysIcon,
  MapPinIcon,
} from "lucide-react";

import FestivalStatusBadge from "@/components/festivals/festival-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getFestivalDateLabel } from "@/app/helpers/next_event";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function FestivalCard({ festival }: { festival: FestivalBase }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex gap-2 items-start">
          <CardTitle>{festival.name}</CardTitle>
          <FestivalStatusBadge status={festival.status} />
        </div>
        <CardDescription>
          {festival.description || "No definido"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {festival.status !== "archived" && (
          <div className="p-4 border rounded-lg space-y-2">
            <div className="flex items-center space-x-2">
              <Label htmlFor="activate">Activar</Label>
              <Switch id="activate" />
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="pre-registration">Acreditación</Label>
              <Switch id="pre-registration" />
            </div>
          </div>
        )}
        <div className="p-4 border rounded-lg space-y-3">
          <h3 className="font-semibold text-xl">Detalles</h3>
          <div>
            <span className="flex gap-2 items-center">
              <CalendarDaysIcon className="w-5 h-5" />{" "}
              {getFestivalDateLabel(festival)}
            </span>
            <span className="flex gap-2 items-center">
              <BuildingIcon className="w-5 h-5" />{" "}
              {festival.locationLabel || "No definido"}
            </span>
            <span className="flex gap-2 items-center">
              <MapPinIcon className="w-5 h-5" />{" "}
              {festival.address || "No definido"}
            </span>
          </div>
        </div>
        {festival.status !== "archived" && (
          <Button className="w-full" variant="outline">
            <ArchiveIcon className="w-5 h-5 mr-2" />
            Archivar
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

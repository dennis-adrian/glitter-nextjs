"use client";

import { CalendarClock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import useActivityRegistration from "@/app/hooks/use-activity-registration";

export default function UpcomingRegistrationNotice({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}) {
  const registration = useActivityRegistration(startDate, endDate);
  if (registration.status !== "upcoming") return null;

  return (
    <div className="container px-3 pt-3 md:px-6 md:pt-6">
      <Alert className="border-primary/30 bg-primary/5">
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>Las inscripciones aún no están abiertas</AlertTitle>
        <AlertDescription>{registration.message}</AlertDescription>
      </Alert>
    </div>
  );
}

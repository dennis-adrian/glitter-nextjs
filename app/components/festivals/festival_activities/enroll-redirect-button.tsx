"use client";

import { RedirectButton } from "@/app/components/redirect-button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/data/festivals/definitions";
import { formatDate } from "@/app/lib/formatters";
import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateTime } from "luxon";

type EnrollRedirectButtonProps = {
  forProfileId: number;
  festivalId: number;
  activity: FestivalActivityWithDetailsAndParticipants;
};

export default function EnrollRedirectButton({
  forProfileId,
  festivalId,
  activity,
}: EnrollRedirectButtonProps) {
  const registrationStartDate = formatDate(activity.registrationStartDate);
  const registrationEndDate = formatDate(activity.registrationEndDate);
  const [isEnabled, setIsEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    // Function to check if current date is within registration period
    const checkRegistrationPeriod = () => {
      const now = DateTime.now();
      // Convert Date objects to Luxon DateTime objects
      const startDate = DateTime.fromJSDate(activity.registrationStartDate);
      const endDate = DateTime.fromJSDate(activity.registrationEndDate);

      if (now < startDate) {
        setIsEnabled(false);
        setStatusMessage(
          `El registro comenzará el ${registrationStartDate.toLocaleString(
            DateTime.DATETIME_MED,
          )}`,
        );
      } else if (now > endDate) {
        setIsEnabled(false);
        setStatusMessage(
          `El registro finalizó el ${registrationEndDate.toLocaleString(
            DateTime.DATETIME_MED,
          )}`,
        );
      } else {
        setIsEnabled(true);
        setStatusMessage(
          `Registro abierto hasta el ${registrationEndDate.toLocaleString(
            DateTime.DATETIME_MED,
          )}`,
        );
      }
    };

    // Check immediately
    checkRegistrationPeriod();

    // Set up interval to check every minute
    const intervalId = setInterval(checkRegistrationPeriod, 5000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [
    activity.registrationStartDate,
    activity.registrationEndDate,
    registrationStartDate,
    registrationEndDate,
  ]);

  return (
    <div className="flex flex-col gap-3 mt-6">
      <div className="flex justify-end w-full">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full md:max-w-[400px] flex flex-col gap-1 justify-center items-center">
                <RedirectButton
                  className="w-full self-end"
                  href={`/profiles/${forProfileId}/festivals/${festivalId}/activity/enroll`}
                  disabled={!isEnabled}
                >
                  {isEnabled ? "Registrarme" : "Registro no disponible"}
                </RedirectButton>
                <span className="text-xs text-center text-muted-foreground lg:hidden">
                  {statusMessage}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{statusMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

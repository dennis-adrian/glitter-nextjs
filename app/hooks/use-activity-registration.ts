"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { formatDisplayDate } from "@/app/lib/formatters";

export default function useActivityRegistration(
  startDate: Date,
  endDate: Date,
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const status =
    now < new Date(startDate).getTime()
      ? "upcoming"
      : now > new Date(endDate).getTime()
        ? "closed"
        : "open";
  const openingDate = formatDisplayDate(startDate, DateTime.DATETIME_MED);
  const closingDate = formatDisplayDate(endDate, DateTime.DATETIME_MED);

  return {
    status,
    isOpen: status === "open",
    message:
      status === "upcoming"
        ? `Inscripciones desde el ${openingDate} (hora de Bolivia).`
        : status === "closed"
          ? `Las inscripciones finalizaron el ${closingDate} (hora de Bolivia).`
          : `Inscripciones abiertas hasta el ${closingDate} (hora de Bolivia).`,
    unavailableLabel:
      status === "upcoming"
        ? "Inscripciones próximamente"
        : "Inscripciones cerradas",
  };
}

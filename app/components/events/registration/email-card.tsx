import Link from "next/link";

import EmailSubmissionForm from "@/app/components/events/registration/email-submission-form";
import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

type EmailCardProps = {
  festival: FestivalWithDates;
  /** The visitor this browser already entered as, to skip the email. */
  continueAs?: string | null;
};
export default function EmailCard(props: EmailCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.festival.name}</CardTitle>
        <CardDescription>{props.festival.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <GeneralInfoDetails
          className="p-0"
          festival={props.festival}
          noMascot
        />
        {props.continueAs ? (
          <p className="mt-4 rounded-md border bg-muted/50 p-3 text-sm">
            ¿Eres {props.continueAs}?{" "}
            <Link href="?step=3" className="font-medium underline">
              Ver tus entradas
            </Link>
          </p>
        ) : null}
        <EmailSubmissionForm festivalId={props.festival.id} />
      </CardContent>
    </Card>
  );
}

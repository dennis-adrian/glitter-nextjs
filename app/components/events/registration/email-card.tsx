import EmailSubmissionForm from "@/app/components/events/registration/email-submission-form";
import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { FestivalWithDates } from "@/app/data/festivals/definitions";

type EmailCardProps = {
  festival: FestivalWithDates;
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
        <EmailSubmissionForm />
      </CardContent>
    </Card>
  );
}

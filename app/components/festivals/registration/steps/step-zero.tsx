import EmailStep from "@/app/components/festivals/registration/steps/email-step";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import { VisitorWithTickets } from "@/app/data/visitors/actions";

type StepZeroProps = {
  registrationType: "individual" | "family";
  numberOfVisitors?: number;
  visitor?: VisitorWithTickets | null;
  onSubmit: () => void;
};

export default function StepZero(props: StepZeroProps) {
  if (props.registrationType === "family") {
    if (props.numberOfVisitors) {
      return <EmailStep onSubmit={props.onSubmit} />;
    } else {
      return <FamilyMembersStep numberOfVisitors={props.numberOfVisitors} />;
    }
  } else if (props.registrationType === "individual") {
    return <EmailStep onSubmit={props.onSubmit} />;
  }

  return null;
}

"use client";

import EmailForm from "@/app/components/festivals/registration/forms/email";
import StepDescription from "@/app/components/festivals/registration/steps/step-decription";
import { VisitorWithTickets } from "@/app/data/visitors/actions";

type EmailStepProps = {
  setVisitor: (visitor: VisitorWithTickets) => void;
};

export default function EmailStep(props: EmailStepProps) {
  return (
    <div className="flex flex-col items-center justify-center">
      <StepDescription
        title="¿Cuál es tu correo electrónico?"
        description="Si ya participaste de alguno de nuestros eventos, todos tus datos están guardados con tu correo electrónico"
      />
      <EmailForm setVisitor={props.setVisitor} />
    </div>
  );
}

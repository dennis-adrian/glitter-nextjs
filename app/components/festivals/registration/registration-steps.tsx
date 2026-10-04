"use client";

import { useState } from "react";

import BirthdayForm from "@/app/components/festivals/registration/forms/birthday";
import EmailForm from "@/app/components/festivals/registration/forms/email";
import GenderForm from "@/app/components/festivals/registration/forms/gender";
import NameForm from "@/app/components/festivals/registration/forms/name";
import PhoneForm from "@/app/components/festivals/registration/forms/phone";
import RegistrationTypeBanner from "@/app/components/festivals/registration/registration-type-banner";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import TicketCreationStep, {
  todaysTicket,
} from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import { stepsDescription } from "@/app/components/festivals/registration/utils";
import { forgetVisitor } from "@/app/lib/visitors/registration-actions";
import type {
  TicketFestivalView,
  VisitorRegistrationView,
} from "@/app/lib/visitors/registration-definitions";
import type { VisitorDetails } from "@/app/lib/visitors/visitor-details-schema";

type RegistrationInfo = {
  step: number;
  type: RegistrationType;
  numberOfVisitors: number;
  showBanner: boolean;
};

type NewVisitorDetails = Omit<VisitorDetails, "gender">;

const initialNewVisitor: NewVisitorDetails = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  birthdate: "",
};

const initialRegistrationInfo: RegistrationInfo = {
  step: 0,
  type: null,
  numberOfVisitors: 0,
  showBanner: false,
};

/** The email step, where an expired session starts over. */
const EMAIL_STEP = 2;
const TICKET_STEP = 7;

/**
 * Registro en puerta: the form visitors open from the QR at the venue. It
 * only ever gives a ticket for today; the server decides what today is.
 */
export default function RegistrationSteps(props: {
  festivalId: number;
  festival: TicketFestivalView;
}) {
  const [registrationInfo, setRegistrationInfo] = useState<RegistrationInfo>(
    initialRegistrationInfo,
  );
  const [newVisitor, setNewVisitor] =
    useState<NewVisitorDetails>(initialNewVisitor);
  const [view, setView] = useState<VisitorRegistrationView | null>(null);

  // Phones at the door get passed around: whoever starts over must not
  // inherit the previous visitor's session.
  const handleReset = () => {
    void forgetVisitor();
    setRegistrationInfo(initialRegistrationInfo);
    setView(null);
    setNewVisitor(initialNewVisitor);
  };

  const handleRestart = () => {
    setView(null);
    setNewVisitor(initialNewVisitor);
    setRegistrationInfo((prev) => ({ ...prev, step: EMAIL_STEP }));
  };

  const handleReturningVisitor = (returning: VisitorRegistrationView) => {
    setView(returning);
    setRegistrationInfo((prev) => ({
      ...prev,
      step: TICKET_STEP,
      showBanner: !todaysTicket(returning.tickets),
    }));
  };

  const handleGoBack = () => {
    setRegistrationInfo((prev) => ({
      ...prev,
      step: prev.step - 1,
    }));
  };

  return (
    <>
      {!registrationInfo.type ? null : (
        <div className="mb-4">
          <RegistrationTypeBanner
            show={registrationInfo.showBanner}
            festivalId={props.festivalId}
            type={registrationInfo.type}
            numberOfVisitors={registrationInfo.numberOfVisitors}
            step={registrationInfo.step}
            onReset={handleReset}
            onGoBack={handleGoBack}
          />
        </div>
      )}
      <StepDescription
        className="mt-6 mb-4 text-center"
        title={stepsDescription[registrationInfo.step]?.title || ""}
        description={stepsDescription[registrationInfo.step]?.description || ""}
      />
      {registrationInfo.step === 0 && (
        <RegistrationTypeCards
          onSelect={(type: RegistrationType) => {
            setRegistrationInfo({
              ...registrationInfo,
              type,
              // A family says how many come in first; one person goes
              // straight to the email.
              step: type === "family" ? 1 : EMAIL_STEP,
              showBanner: true,
            });
          }}
        />
      )}
      {registrationInfo.step === 1 && (
        <FamilyMembersStep
          numberOfVisitors={registrationInfo.numberOfVisitors}
          onContinue={(numberOfVisitors) => {
            setRegistrationInfo((prev) => ({
              ...prev,
              numberOfVisitors,
              step: 2,
            }));
          }}
        />
      )}
      {registrationInfo.step === EMAIL_STEP && (
        <EmailForm
          festivalId={props.festivalId}
          onReturning={handleReturningVisitor}
          onNew={() => setRegistrationInfo((prev) => ({ ...prev, step: 3 }))}
        />
      )}
      {registrationInfo.step === 3 && (
        <NameForm
          onSubmit={(firstName: string, lastName: string) => {
            setNewVisitor({ ...newVisitor, firstName, lastName });
            setRegistrationInfo({ ...registrationInfo, step: 4 });
          }}
        />
      )}
      {registrationInfo.step === 4 && (
        <BirthdayForm
          onSubmit={(birthdate: string) => {
            setNewVisitor({ ...newVisitor, birthdate });
            setRegistrationInfo({ ...registrationInfo, step: 5 });
          }}
        />
      )}
      {registrationInfo.step === 5 && (
        <PhoneForm
          onSubmit={(phoneNumber: string) => {
            setNewVisitor({ ...newVisitor, phoneNumber });
            setRegistrationInfo({ ...registrationInfo, step: 6 });
          }}
        />
      )}
      {registrationInfo.step === 6 && (
        <GenderForm
          festivalId={props.festivalId}
          details={newVisitor}
          onSuccess={(registered: VisitorRegistrationView) => {
            setView(registered);
            setRegistrationInfo({ ...registrationInfo, step: TICKET_STEP });
          }}
          onRestart={handleRestart}
        />
      )}
      {registrationInfo.step === TICKET_STEP && view ? (
        <TicketCreationStep
          festivalId={props.festivalId}
          festival={props.festival}
          view={view}
          numberOfVisitors={registrationInfo.numberOfVisitors}
          onSuccess={(updated) => {
            setView(updated);
            setRegistrationInfo({ ...registrationInfo, showBanner: false });
          }}
          onRestart={handleRestart}
        />
      ) : null}
    </>
  );
}

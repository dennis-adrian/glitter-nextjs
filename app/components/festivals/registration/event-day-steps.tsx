"use client";

// import BirthdayStep from "@/app/components/festivals/registration/steps/brithday-step";
import CreatedTicket from "@/app/components/festivals/registration/steps/created-ticket";
// import GenderStep from "@/app/components/festivals/registration/steps/gender-step";
// import NameStep from "@/app/components/festivals/registration/steps/name-step";
// import PhoneStep from "@/app/components/festivals/registration/steps/phone-step";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { useRouter, useSearchParams } from "next/navigation";

type EventDayStepsProps = {
  email?: string;
  enableTicketCreation: boolean;
  festival: FestivalWithDates;
  numberOfVisitors?: number;
  registrationType: "individual" | "family";
  step?: number;
  visitor?: VisitorWithTickets | null;
};

export default function EventDaySteps(props: EventDayStepsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentParams = new URLSearchParams(searchParams.toString());

  function updateStep(step: number) {
    currentParams.set("step", step.toString());
    router.push(`?${currentParams.toString()}`);
  }

  function handleNameStep(firstName: string, lastName: string) {
    currentParams.set("firstName", firstName);
    currentParams.set("lastName", lastName);
    updateStep(2);
  }

  function handleBirthdayStep(birthdate: Date) {
    currentParams.set("birthdate", birthdate.toISOString());
    updateStep(3);
  }

  function handlePhoneStep(phoneNumber: string) {
    currentParams.set("phoneNumber", phoneNumber);
    updateStep(4);
  }

  return (
    <div className="w-full md:mt-6">
      {/* {(!props.step || props.step === 0) && (
        <StepZero
          numberOfVisitors={props.numberOfVisitors}
          registrationType={props.registrationType}
          visitor={props.visitor}
          onSubmit={() => updateStep(1)}
        />
      )} */}
      {!props.enableTicketCreation && props.email && (
        <>
          {/* {props.step === 1 && <NameStep updateVisitor={handleNameStep} />} */}
          {/* {props.step === 2 && (
            <BirthdayStep updateVisitor={handleBirthdayStep} />
          )} */}
          {/* {props.step === 3 && <PhoneStep updateVisitor={handlePhoneStep} />} */}
          {/* {props.step === 4 && (
            <GenderStep
              festival={props.festival}
              numberOfVisitors={props.numberOfVisitors}
            />
          )} */}
          {props.step === 5 && props.visitor && (
            <CreatedTicket festival={props.festival} visitor={props.visitor} />
          )}
        </>
      )}
      {props.enableTicketCreation && props.visitor && (
        <TicketCreationStep
          festival={props.festival}
          numberOfVisitors={props.numberOfVisitors}
          visitor={props.visitor}
        />
      )}
    </div>
  );
}

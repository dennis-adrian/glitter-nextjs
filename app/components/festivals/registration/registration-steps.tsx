"use client";

import { useEffect, useState } from "react";

import BirthdayForm from "@/app/components/festivals/registration/forms/birthday";
import EmailForm from "@/app/components/festivals/registration/forms/email";
import GenderForm from "@/app/components/festivals/registration/forms/gender";
import NameForm from "@/app/components/festivals/registration/forms/name";
import PhoneForm from "@/app/components/festivals/registration/forms/phone";
import RegistrationTypeBanner from "@/app/components/festivals/registration/registration-type-banner";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import { stepsDescription } from "@/app/components/festivals/registration/utils";
import { NewVisitor, VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";
import { formatDate } from "@/app/lib/formatters";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";

type RegistrationInfo = {
  step: number;
  type: RegistrationType;
  numberOfVisitors: number;
  showBanner: boolean;
};

const initialNewVisitor: NewVisitor = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  birthdate: new Date(),
  gender: "other",
};

const initialRegistrationInfo: RegistrationInfo = {
  step: 0,
  type: null,
  numberOfVisitors: 0,
  showBanner: false,
};

export default function RegistrationSteps(props: {
  festival: FestivalWithDates;
}) {
  const [registrationInfo, setRegistrationInfo] = useState<RegistrationInfo>(
    initialRegistrationInfo,
  );
  const [newVisitor, setNewVisitor] = useState<NewVisitor>(initialNewVisitor);
  const [returningVisitor, setReturningVisitor] =
    useState<VisitorWithTickets | null>(null);

  useEffect(() => {
    if (registrationInfo.type === "individual") {
      setRegistrationInfo((prev) => ({
        ...prev,
        step: 2,
      }));
    } else if (registrationInfo.type === "family") {
      setRegistrationInfo((prev) => ({
        ...prev,
        step: 1,
      }));
    }
  }, [registrationInfo.type]);

  const handleReset = () => {
    setRegistrationInfo(initialRegistrationInfo);
    setReturningVisitor(null);
    setNewVisitor(initialNewVisitor);
  };

  const handleVisitorSearch = (
    email: string,
    visitor?: VisitorWithTickets | null,
  ) => {
    if (visitor) {
      setReturningVisitor(visitor);

      const tickets = getVisitorFestivalTickets(visitor, props.festival);
      const currentDayTicket = tickets.find((ticket) => {
        return formatDate(ticket.date)
          .startOf("day")
          .equals(formatDate(new Date()).startOf("day"));
      });

      setRegistrationInfo({
        ...registrationInfo,
        step: 7,
        showBanner: !currentDayTicket,
      });
    } else {
      setNewVisitor({ ...newVisitor, email });
      setRegistrationInfo({ ...registrationInfo, step: 3 });
    }
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
						festivalId={props.festival.id}
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
			{registrationInfo.step === 2 && (
				<EmailForm onSubmit={handleVisitorSearch} />
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
					onSubmit={(date: Date) => {
						setNewVisitor({ ...newVisitor, birthdate: date });
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
					festival={props.festival}
					numberOfVisitors={registrationInfo.numberOfVisitors}
					visitor={newVisitor}
					onSuccess={(visitor: VisitorWithTickets) => {
						setReturningVisitor(visitor);
						setRegistrationInfo({ ...registrationInfo, step: 7 });
					}}
				/>
			)}
			{registrationInfo.step === 7 && returningVisitor?.id ? (
				<TicketCreationStep
					festival={props.festival}
					visitor={returningVisitor}
					numberOfVisitors={registrationInfo.numberOfVisitors}
					onSuccess={(visitor) => {
						setReturningVisitor(visitor);
						setRegistrationInfo({ ...registrationInfo, showBanner: false });
					}}
				/>
			) : null}
		</>
	);
}

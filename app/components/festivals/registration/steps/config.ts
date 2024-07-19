import EmailStep from "@/app/components/festivals/registration/steps/email-step";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";

const individualRegisteredSteps = [
  {
    component: EmailStep,
  },
];

const familyRegisteredSteps = [
  {
    component: FamilyMembersStep,
  },
  {
    component: EmailStep,
  },
];

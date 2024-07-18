import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";

type RegistrationTypeStepProps = {
  festivalId: number;
  type?: "individual" | "family";
};

export default function RegistrationTypeStep(props: RegistrationTypeStepProps) {
  return (
    <>
      {!props.type && (
        <div className="text-center my-6">
          <h3 className="text-xl font-semibold">¿Cómo vienes al evento?</h3>
          <span className="text-muted-foreground">
            Elige la opción que mejor refleje tu situación
          </span>
        </div>
      )}
      <RegistrationTypeCards
        festivalId={props.festivalId}
        selectedType={props.type}
      />
    </>
  );
}

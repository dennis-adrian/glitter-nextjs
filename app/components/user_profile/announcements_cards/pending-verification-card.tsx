import BaseCard from "./base-card";

export default async function PendingVerificationCard({
  forAdmin = false,
}: {
  /** The admin dashboard shows it too, where the copy speaks about the participant. */
  forAdmin?: boolean;
}) {
  return (
    <BaseCard
      content={
        <p>
          {forAdmin
            ? "Perfil en revisión. El participante está esperando que lo revisemos."
            : "Tu perfil está en revisión. Te vamos a escribir cuando nuestro equipo lo revise."}
        </p>
      }
    />
  );
}

import BaseCard from "./base-card";

export default async function PendingVerificationCard() {
  return (
    <BaseCard
      content={
        <p>
          Gracias por completar tu perfil. Te enviaremos un correo electrónico
          luego de que nuestro equipo lo revise.
        </p>
      }
    />
  );
}

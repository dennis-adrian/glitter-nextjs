import BaseCard from "./base-card";

export default async function PendingArtistCard() {
  return (
    <BaseCard
      content={
        <p>
          Gracias por querer ser parte de la comunidad de{" "}
          <strong>Glitter</strong>. Tu enviaremos un correo cuando tu perfil sea
          verificado.
        </p>
      }
    />
  );
}

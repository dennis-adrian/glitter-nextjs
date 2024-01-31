import Image from "next/image";

import { faInstagram } from "@fortawesome/free-brands-svg-icons";
import { londrinaSolid, roboto, junegull } from "@/ui/fonts";

import LinkButton from "@/app/ui/link-button";

export default function Home() {
  return (
    <main
      className={`${roboto.className} via-gradient-dark flex min-h-screen flex-col items-center bg-gradient-to-b from-blue-900 from-10% via-30% to-amber-50 to-50% pt-6 text-center`}
    >
      <section className="bg-hero-pattern p-2">
        <h1 className={`${junegull.className} text-5xl text-white`}>
          ¡Brillemos juntos!
        </h1>
        <p
          className={`${londrinaSolid.className} m-auto max-w-xs py-4 text-xl leading-6 text-white`}
        >
          Crea experiencias que te inspiren, conecta con otros artistas y
          celebra lo que eres{" "}
        </p>
        <Image
          className="m-auto"
          src="/img/mascot.png"
          alt="Mascota Glitter"
          width={300}
          height={300}
        />
      </section>
      <section className="text-secondary-foreground bg-amber-50 p-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          Próximo Evento
        </h1>
        <p className="py-4 text-xl leading-6">
          El 2 y 3 de marzo tendremos nuestra siguiente edición de Glitter
          Publicaremos la convocatoria en nuestras redes en enero
        </p>
        <LinkButton
          href="https://www.instagram.com/glitter.bo"
          icon={faInstagram}
          target="_blank"
        >
          Síguenos en Instagram
        </LinkButton>
      </section>
      <section className="w-screen bg-white px-2 py-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          ¿Quiénes somos?
        </h1>
        <p className="py-4 text-xl leading-6">
          Lorem ipsum dolor sit amet consectetur. Mauris dictumst quis bibendum
          a porttitor ut. Platea at ac nisi massa. Nec in lobortis nunc vel
          amet.
        </p>
      </section>
    </main>
  );
}

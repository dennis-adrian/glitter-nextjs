import Image from 'next/image';
import { faInstagram } from '@fortawesome/free-brands-svg-icons';
import { londrinaSolid, roboto } from '@/ui/fonts';
import LinkButton from '@/app/ui/link-button';

export default function Home() {
  return (
    <main
      className={`${roboto.className} flex min-h-screen flex-col items-center text-center pt-6 bg-gradient-to-b from-gradient-darker from-10% via-gradient-dark via-30% to-gradient-light to-50%`}
    >
      <section className="bg-hero-pattern p-2">
        <h1 className="text-white font-heading text-5xl">¡Brillemos juntos!</h1>
        <p
          className={`${londrinaSolid.className} text-white text-xl leading-6 max-w-xs m-auto py-4`}
        >
          Crea experiencias que te inspiren, conecta con otros artistas y
          celebra lo que eres{' '}
        </p>
        <Image
          className="m-auto"
          src="/img/mascot.png"
          alt="Mascota Glitter"
          width={300}
          height={300}
        />
      </section>
      <section className="bg-accent text-dark-blue p-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          Próximo Evento
        </h1>
        <p className="text-xl leading-6 py-4">
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
      <section className="bg-white w-screen py-8 px-2">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          ¿Quiénes somos?
        </h1>
        <p className="text-xl leading-6 py-4">
          Lorem ipsum dolor sit amet consectetur. Mauris dictumst quis bibendum
          a porttitor ut. Platea at ac nisi massa. Nec in lobortis nunc vel
          amet.
        </p>
      </section>
    </main>
  );
}

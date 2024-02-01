import Image from "next/image";
import Link from "next/link";

import { londrinaSolid, junegull } from "@/ui/fonts";

import Button from "@/ui/button";
import bg_image from "../public/img/bg_w_1280.png";

export default function Home() {
  return (
    <div className="text-center">
      <section className="relative flex flex-col items-center justify-center">
        <div className="-z-10">
          <Image
            alt="background image"
            src={bg_image}
            placeholder="blur"
            quality={100}
            fill
            style={{
              objectFit: "cover",
            }}
          />
        </div>
        <div className="m-auto flex max-w-md flex-col justify-center">
          <h1
            className={`${junegull.className} inline-block bg-gradient-to-r from-pink-50 via-fuchsia-200 to-amber-200 bg-clip-text text-5xl text-transparent text-white`}
          >
            ¡Brillemos juntos!
          </h1>
        </div>
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
      <section className="text-secondary-foreground m-auto max-w-screen-md bg-amber-50 p-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          Próximo Evento
        </h1>
        <p className="py-4 text-xl leading-6">
          El 2 y 3 de marzo tendremos nuestra siguiente edición de Glitter.
          Publicaremos la convocatoria en nuestras redes en enero
        </p>
        <Button>
          <Link href="/sign_up">¡Quiero participar!</Link>
        </Button>
      </section>
      <section className="m-auto max-w-screen-md bg-white px-2 py-8">
        <h1 className={`${londrinaSolid.className} text-4xl`}>
          ¿Quiénes somos?
        </h1>
        <p className="m-auto max-w-screen-md py-4 text-center text-xl leading-6">
          Lorem ipsum dolor sit amet consectetur. Mauris dictumst quis bibendum
          a porttitor ut. Platea at ac nisi massa. Nec in lobortis nunc vel
          amet.
        </p>
      </section>
    </div>
  );
}

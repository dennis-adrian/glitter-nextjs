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
        <div className="m-auto mt-8 flex max-w-md flex-col justify-center">
          <h1
            className={`${junegull.className} inline-block bg-gradient-to-r from-pink-50 via-fuchsia-200 to-amber-200 bg-clip-text text-5xl text-transparent text-white`}
          >
            ¡Brillemos juntos!
          </h1>
        </div>
        <p
          className={`${londrinaSolid.className} m-auto max-w-xs py-4 text-xl leading-6 text-white`}
        >
          Festival para que los artistas brillen
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
          Glitter es una productora de eventos artistísticos dedicada a
          proporcionar un espacio seguro y acogedor para que ilustradores,
          artistas y autores de comics puedan mostrar y vender su arte
        </p>
      </section>
    </div>
  );
}

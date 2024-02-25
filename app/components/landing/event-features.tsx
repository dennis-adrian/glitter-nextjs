import Image from "next/image";

export default function EventFeatures() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-8 max-w-screen-lg m-auto">
      <figure>
        <Image
          className="m-auto"
          src="/img/landing/samy-illustration.png"
          alt={`Ilustración de Samy 1`}
          width={240}
          height={240}
        />
        <figcaption className="font-semibold">Ilustración</figcaption>
      </figure>
      <figure>
        <Image
          className="m-auto"
          src="/img/landing/samy-pin.png"
          alt={`Ilustración de Samy 1`}
          width={240}
          height={240}
        />
        <figcaption className="font-semibold">Pines</figcaption>
      </figure>
      <figure>
        <Image
          className="m-auto"
          src="/img/landing/samy-comic.png"
          alt={`Ilustración de Samy 1`}
          width={240}
          height={240}
        />
        <figcaption className="font-semibold">Cómics</figcaption>
      </figure>
      <figure>
        <Image
          className="m-auto"
          src="/img/landing/samy-stickers.png"
          alt={`Ilustración de Samy 1`}
          width={240}
          height={240}
        />
        <figcaption className="font-semibold">Stickers</figcaption>
      </figure>
    </div>
  );
}

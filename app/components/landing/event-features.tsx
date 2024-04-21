import Image from "next/image";

function Figure({
  className,
  src,
  alt,
  caption,
}: {
  className?: string;
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className={className}>
      <div className="flex flex-col items-center">
        <Image src={src} alt={alt} width={250} height={240} />
        <figcaption className="font-semibold">{caption}</figcaption>
      </div>
    </figure>
  );
}

export default function EventFeatures() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-8 m-auto">
      <Figure
        className="flex justify-end"
        src="/img/landing/mascot-illustration.png"
        alt="Samy ilustrador"
        caption="Ilustración"
      />
      <Figure
        className="flex justify-end"
        src="/img/landing/mascot-pin.png"
        alt="Samy con un pin"
        caption="Pines"
      />
      <Image
        className="self-start justify-self-center drop-shadow-lg"
        alt="yellow star"
        src="/img/landing/star-yellow.png"
        height={90}
        width={90}
      />
      <Image
        className="self-center justify-self-center drop-shadow-lg"
        alt="blue star"
        src="/img/landing/star-blue.png"
        height={90}
        width={90}
      />
      <Figure
        className="flex justify-start"
        src="/img/landing/mascot-comic.png"
        alt="Samy con un comic"
        caption="Cómics"
      />
      <Figure
        className="flex justify-start"
        src="/img/landing/mascot-stickers.png"
        alt="Samy con stickers"
        caption="Stickers"
      />
    </div>
  );
}

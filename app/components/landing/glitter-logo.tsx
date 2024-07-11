import Image from "next/image";

type GlitterLogoProps = {
  variant?: "light" | "dark";
};

export default function GlitterLogo(props: GlitterLogoProps) {
  return (
    <Image
      src={
        props.variant === "dark"
          ? "/img/logo/glitter-logo-dark-160x160.png"
          : "/img/logo/glitter-logo-light-160x160.png"
      }
      alt="Logo"
      width={40}
      height={40}
    />
  );
}

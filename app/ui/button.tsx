import { cva, cx, type VariantProps } from "class-variance-authority";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { twMerge } from "tailwind-merge";

const button = cva(
  "antialiased font-bold m-auto flex items-center rounded-xl py-3 px-8 leading-4 drop-shadow-lg transition ease-in-out duration-300 hover:scale-105 active:translate-y-1",
  {
    variants: {
      intent: {
        primary:
          "bg-primary text-white hover:bg-gradient-to-r from-violet-500 to-fuchsia-500",
        secondary: "text-white bg-secondary hover:bg-secondary-dark",
        accent: "text-dark-blue bg-accent hover:bg-accent-dark",
        light: "text-dark-blue bg-white hover:bg-gray-100",
        ghost: "text-dark-blue bg-transparent hover:bg-gray-100",
      },
      outline: {
        true: "border-2 bg-transparent",
      },
      disabled: {
        true: "opacity-50 cursor-not-allowed",
      },
    },
    defaultVariants: {
      intent: "primary",
      outline: false,
      disabled: false,
    },
    compoundVariants: [
      {
        intent: "primary",
        outline: true,
        class: "text-primary border-primary hover:text-white",
      },
      {
        intent: "secondary",
        outline: true,
        class:
          "text-secondary border-secondary hover:text-white hover:border-secondary-dark",
      },
      {
        intent: "accent",
        outline: true,
        class:
          "border-accent text-accent hover:border-accent-dark hover:text-dark-blue",
      },
      {
        intent: "light",
        outline: true,
        class:
          "text-white border-white hover:text-dark-blue hover:border-gray-100",
      },
      {
        intent: ["primary", "accent", "secondary", "light"],
        disabled: true,
        class: "hover:scale-100 active:translate-y-0",
      },
    ],
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    icon?: IconDefinition;
  };

const Button = ({
  className,
  children,
  disabled,
  icon,
  intent,
  outline,
  onClick,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={twMerge(button({ intent, outline, disabled }), className)}
      onClick={onClick}
      {...props}
    >
      {icon ? <FontAwesomeIcon className="mr-2 w-4" icon={icon} /> : null}
      {children}
    </button>
  );
};

export default Button;

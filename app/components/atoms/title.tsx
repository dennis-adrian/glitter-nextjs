import { cn } from "@/app/lib/utils";

type TitleProps = {
	children: React.ReactNode;
	level?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	className?: string;
};

export default function Title({
	children,
	level = "h1",
	className,
}: TitleProps) {
	const Heading = level;
	let classes = "";
	switch (level) {
		case "h1":
			classes = "text-2xl md:text-4xl font-bold tracking-tight";
			break;
		case "h2":
			classes = "text-xl md:text-3xl font-bold tracking-tight";
			break;
		case "h3":
			classes =
				"text-lg md:text-2xl font-semibold tracking-tight leading-tight";
			break;
		case "h4":
			classes =
				"text-base md:text-lg font-semibold tracking-tight leading-tight";
			break;
		case "h5":
			classes = "text-sm md:text-base font-medium tracking-tight leading-tight";
			break;
		case "h6":
			classes = "text-xs md:text-sm font-medium tracking-tight leading-tight";
			break;
		default:
			classes = "text-2xl md:text-4xl font-bold tracking-tight";
			break;
	}

	classes = cn(classes, className);

	return <Heading className={classes}>{children}</Heading>;
}

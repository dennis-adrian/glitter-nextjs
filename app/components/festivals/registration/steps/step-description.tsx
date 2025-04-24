type StepDescriptionProps = {
	className?: string;
	title: string;
	description?: string;
};

export default function StepDescription(props: StepDescriptionProps) {
  return (
		<div className={props.className}>
			<h3 className="md:text-lg font-medium mb-1 md:mb-0">{props.title}</h3>
			<p className="text-muted-foreground text-sm md:text-base leading-tight md:leading-normal">
				{props.description}
			</p>
		</div>
	);
}

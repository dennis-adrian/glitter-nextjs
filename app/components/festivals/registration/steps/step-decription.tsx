type StepDescriptionProps = {
  title: string;
  description?: string;
};

export default function StepDescription(props: StepDescriptionProps) {
  return (
    <div className="text-center mt-6 mb-3">
      <h3 className="text-xl font-semibold">{props.title}</h3>
      <span className="text-muted-foreground">{props.description}</span>
    </div>
  );
}

/** Placeholder shown instead of the form when the call is closed or missing. */
export default function VolunteerCallClosed({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="grid gap-2 rounded-lg border p-6 text-center">
      <h2 className="text-2xl font-semibold break-words">{title}</h2>
      <p className="text-muted-foreground break-words">{message}</p>
    </section>
  );
}

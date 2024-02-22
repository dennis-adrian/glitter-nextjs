import { fetchFestival } from "@/app/api/festivals/actions";

export default async function Page({ params }: { params: { id: string } }) {
  const festival = await fetchFestival(parseInt(params.id));

  if (!festival) {
    return (
      <main className="container">
        <h1>Event Audience Registration</h1>
        <p>Event not found</p>
      </main>
    );
  }

  if (festival.status !== "active") {
    return (
      <main className="container">
        <h1>Event Audience Registration</h1>
        <p>Event is not active</p>
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Event Audience Registration</h1>
      <p>Event ID: {params.id}</p>
    </main>
  );
}

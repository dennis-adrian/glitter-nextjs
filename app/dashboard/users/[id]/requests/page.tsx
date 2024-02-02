import { fetchUserProfileById } from "@/app/api/users/actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function Page({ params }: { params: { id: string } }) {
  const userId = params.id;
  const data = await fetchUserProfileById(parseInt(userId));

  if (!data.user) {
    return <div>User not found</div>;
  }

  const requests = data.user.userRequests;

  if (requests.length === 0) {
    return <div>No requests</div>;
  }

  return (
    <div className="m-auto max-w-screen-sm">
      <h1 className="mb-6 mt-8 text-2xl font-bold">
        Solicitudes de {data.user.displayName}
      </h1>
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <CardTitle>
              {request.type === "become_artist"
                ? "Solicitud para ser artista"
                : "Solicitud para participar de evento"}
            </CardTitle>
            <CardDescription>
              Creación: {request.createdAt.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <div className="flex w-full justify-end">
              <Button className="mr-2" variant="outline">
                Rechazar
              </Button>
              <form>
                <Button type="submit">Aceptar</Button>
              </form>
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

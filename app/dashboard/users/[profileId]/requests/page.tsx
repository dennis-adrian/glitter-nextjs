import { fetchRequestsByUserId } from "@/app/api/user_requests/actions";

import { Badge } from "@/app/components/ui/badge";
import Form from "./form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function Page(
  props: {
    params: Promise<{ profileId: string }>;
  }
) {
  const params = await props.params;
  const userId = params.profileId;
  const requests = await fetchRequestsByUserId(parseInt(userId));

  if (requests.length === 0) {
    return <div>No requests</div>;
  }

  const user = requests[0].user;

  return (
    <div className="m-auto max-w-screen-sm">
      <h1 className="mb-6 mt-8 text-2xl font-bold">
        Solicitudes de {user.displayName}
      </h1>
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <CardTitle>
              <div className="flex justify-between">
                <span>
                  {request.type === "become_artist"
                    ? "Solicitud para ser artista"
                    : "Solicitud para participar de evento"}
                </span>
                <Badge>{request.status}</Badge>
              </div>
            </CardTitle>
            <CardDescription>
              Creación: {request.createdAt.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form request={request} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

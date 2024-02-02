import { fetchUserProfileById } from "@/app/api/users/actions";

import { Badge } from "@/app/components/ui/badge";
import Form from "@/app/dashboard/users/[id]/requests/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
            <Form request={request} userRole={data.user!.role} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

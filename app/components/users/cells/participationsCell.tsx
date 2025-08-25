"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import Link from "next/link";
import { Participation } from "@/app/api/users/definitions";

type Props = {
  participations: Participation[];
};

export default function ParticipationsCell({ participations }: Props) {
  const [open, setOpen] = useState(false);

  const count = participations?.length || 0;
  console.log({ participations });

  if (count === 0) {
    return <span>0 participaciones</span>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <span className="underline cursor-pointer">
          {count} participaciones
        </span>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Participaciones del usuario</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">ID</th>
                <th className="p-2 text-left">Festival</th>
                <th className="p-2 text-left">Stand</th>
                <th className="p-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {participations.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="p-2">{p.id}</td>
                  <td className="p-2">
                    <Link
                      href={`/festivals/${p.reservation.festival.id}`}
                      className="text-blue-600 underline"
                      target="_blank"
                    >
                      {p.reservation.festival.name}
                    </Link>
                  </td>
                  <td className="p-2">
                    {p.reservation.stand.label}{p.reservation.stand.standNumber}
                  </td>

                  <td className="p-2">{p.reservation.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

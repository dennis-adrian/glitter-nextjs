import React from "react";

import { Resend } from "resend";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorWithTickets } from "@/app/api/visitors/actions";
import TicketEmailTemplate from "@/app/emails/ticket";

const resend = new Resend(process.env.RESEND_API_KEY);

type RequestBody = {
  visitor: VisitorWithTickets;
  festival: FestivalBase;
};

export async function POST(req: Request) {
  try {
    const { visitor, festival }: RequestBody = await req.json();

    if (!visitor || !festival) {
      return new Response(
        JSON.stringify({ message: "No visitor or festival was provided" }),
        {
          status: 400,
        },
      );
    } else if (!visitor.email) {
      return new Response(
        JSON.stringify({ message: "No email was provided" }),
        {
          status: 400,
        },
      );
    }

    const data = await resend.emails.send({
      from: "Equipo de Glitter <no-reply@festivalglitter.art>",
      to: [visitor.email],
      subject: "Confirmación de Registro para Glitter Vol 2",
      react: TicketEmailTemplate({
        visitor,
        festival,
      }) as React.ReactElement,
    });

    return Response.json({ data });
  } catch (error) {
    console.log(error);
    return new Response(null, { status: 500 });
  }
}

"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { useForm } from "react-hook-form";

type EventDayTicketCreationFormProps = {
  festival: FestivalBase;
  visitor: VisitorWithTickets;
};

export default function EventDayTicketCreationForm(
  props: EventDayTicketCreationFormProps,
) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    console.log("Submit event day ticket creation form");
  });

  return (
    <Form {...form}>
      <form action={action}>
        <Button className="w-full">Adquirir entrada</Button>
      </form>
    </Form>
  );
}

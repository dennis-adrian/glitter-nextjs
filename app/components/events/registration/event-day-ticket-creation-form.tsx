"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { createEventDayTicket } from "@/app/data/tickets/actions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type EventDayTicketCreationFormProps = {
  festival: FestivalBase;
  visitor: VisitorWithTickets;
};

export default function EventDayTicketCreationForm(
  props: EventDayTicketCreationFormProps,
) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await createEventDayTicket({
      visitorId: props.visitor.id,
      festivalId: props.festival.id,
    });

    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <Button disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : (
            <span>Adquirir entrada</span>
          )}
        </Button>
      </form>
    </Form>
  );
}

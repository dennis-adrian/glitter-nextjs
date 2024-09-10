import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { FestivalBase, FestivalDate } from "@/app/data/festivals/definitions";
import { createTicket, sendTicketEmail } from "@/app/data/tickets/actions";
import { VisitorBase } from "@/app/data/visitors/actions";
import { formatDate } from "@/app/lib/formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  selectedDate: z.string().min(1),
});

type AddTicketFormProps = {
  festival: FestivalBase;
  festivalDates: FestivalDate[];
  visitor: VisitorBase;
  onSuccess: () => void;
};

export default function AddTicketForm({
  festival,
  festivalDates,
  visitor,
  onSuccess,
}: AddTicketFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      selectedDate: festivalDates[0].startDate.toISOString(),
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const date = DateTime.fromISO(data.selectedDate);
    if (!date.isValid) {
      toast.error("La fecha seleccionada no es válida");
      return;
    }

    const res = await createTicket({
      date: date.toJSDate(),
      festival: festival,
      visitor: visitor,
    });

    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid gap-3">
        <h2 className="text-lg font-medium">Elige el día que asistirás</h2>
        <FormField
          control={form.control}
          name="selectedDate"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  {festivalDates.map((date, index) => {
                    const formattedDate = formatDate(date.startDate);
                    return (
                      <FormItem
                        key={index}
                        className="w-full sm:w-fit mx-auto p-4 flex items-center gap-4 rounded-md border hover:text-primary-500 hover:bg-primary-50 hover:border-primary-500 active:text-primary-500 active:bg-primary-50 active:border-primary-500 focus:text-primary-500 focus:bg-primary-50 focus:border-primary-500"
                      >
                        <FormControl>
                          <RadioGroupItem
                            value={date.startDate.toISOString()}
                          />
                        </FormControl>
                        <FormLabel className="flex flex-col gap-4 justify-center text-foreground text-center font-normal">
                          <span className="">{festival.name}</span>
                          <span className="flex flex-col font-semibold">
                            <span className="text-base capitalize">
                              {formattedDate.weekdayLong}
                            </span>
                            <span className="text-base">
                              {formattedDate.toLocaleString(DateTime.DATE_FULL)}
                            </span>
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Entrada libre
                          </span>
                        </FormLabel>
                      </FormItem>
                    );
                  })}
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          label="Adquirir entrada"
          loading={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}

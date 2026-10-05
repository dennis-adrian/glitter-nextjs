import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import type { FestivalDate } from "@/app/lib/festivals/definitions";
import { formatDate, formatDisplayDate } from "@/app/lib/formatters";
import { claimTicket } from "@/app/lib/visitors/registration-actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  selectedDate: z.string().min(1),
});

type AddTicketFormProps = {
  festivalId: number;
  festivalName: string;
  festivalDates: FestivalDate[];
  onSuccess: () => void;
};

export default function AddTicketForm({
  festivalId,
  festivalName,
  festivalDates,
  onSuccess,
}: AddTicketFormProps) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      selectedDate: festivalDates[0].startDate.toISOString(),
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await claimTicket({ festivalId, date: data.selectedDate });

    if (res.success) {
      toast.success(res.message);
      onSuccess();
      router.refresh();
    } else {
      toast.error(res.message);
      if (res.restart) router.push("?step=1");
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
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  {festivalDates.map((date, index) => {
                    const formattedDate = formatDate(date.startDate);
                    return (
                      <FormItem
                        key={index}
                        className="w-full border rounded-md p-3 hover:bg-primary-50 hover:text-primary-500 hover:border-primary-500 active:text-primary-500 active:bg-primary-50 active:border-primary-500 focus:text-primary-500 focus:bg-primary-50 focus:border-primary-500"
                      >
                        <FormControl>
                          <RadioGroupItem
                            value={date.startDate.toISOString()}
                          />
                        </FormControl>
                        <FormLabel className="flex flex-col gap-4 justify-center text-foreground text-center font-normal">
                          <span className="">{festivalName}</span>
                          <span className="flex flex-col font-semibold">
                            <span className="text-base capitalize">
                              {formattedDate.weekdayLong}
                            </span>
                            <span className="text-base">
                              {formatDisplayDate(
                                formattedDate,
                                DateTime.DATE_FULL,
                              )}
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

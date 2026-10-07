import AddTicketForm from "@/app/components/events/registration/add-ticket-form";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import type { FestivalDate } from "@/app/lib/festivals/definitions";

type AddTicketModalProps = {
  festivalId: number;
  festivalName: string;
  festivalDates: FestivalDate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
export default function AddTicketModal(props: AddTicketModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <DrawerDialogContent isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Adquirir Entrada
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"} pt-2`}>
          {props.festivalDates.length === 0 ? (
            <div className="py-8 text-center border rounded-md text-muted-foreground">
              Ya tienes entradas para todas las fechas
            </div>
          ) : (
            <AddTicketForm
              festivalId={props.festivalId}
              festivalName={props.festivalName}
              festivalDates={props.festivalDates}
              onSuccess={() => props.onOpenChange(false)}
            />
          )}
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cancelar</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

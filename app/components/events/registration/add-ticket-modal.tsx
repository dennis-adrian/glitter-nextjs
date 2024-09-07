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
import { FestivalBase, FestivalDate } from "@/app/data/festivals/definitions";
import { VisitorBase } from "@/app/data/visitors/actions";
import { useMediaQuery } from "@/app/hooks/use-media-query";

type AddTicketModalProps = {
  festival: FestivalBase;
  festivalDates: FestivalDate[];
  open: boolean;
  visitor: VisitorBase;
  onOpenChange: (open: boolean) => void;
};
export default function AddTicketModal(props: AddTicketModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <DrawerDialog isDesktop={isDesktop} {...props}>
      <DrawerDialogContent isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Adquirir Entrada
          </DrawerDialogTitle>
        </DrawerDialogHeader>
        <div className={`${isDesktop ? "" : "px-4"} pt-2`}>
          <AddTicketForm
            festival={props.festival}
            festivalDates={props.festivalDates}
            visitor={props.visitor}
          />
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

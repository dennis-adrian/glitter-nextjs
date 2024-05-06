import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FestivalBase } from "@/app/data/festivals/definitions";

type FestivalSwitchProps = {
  checked: boolean;
  disabled: boolean;
  label: string;
  festival: FestivalBase;
  tooltipContent: string;
  onChange: () => void;
};

export default function FestivalSwitch(props: FestivalSwitchProps) {
  if (!props.disabled) {
    return (
      <div className="flex items-center space-x-2">
        <Label>{props.label}</Label>
        <Switch checked={props.checked} onCheckedChange={props.onChange} />
      </div>
    );
  }

  return (
    <div className="flex text-muted-foreground items-center space-x-2">
      <Label>{props.label}</Label>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Switch
                disabled={props.disabled}
                checked={props.checked}
                onCheckedChange={props.onChange}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>{props.tooltipContent}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

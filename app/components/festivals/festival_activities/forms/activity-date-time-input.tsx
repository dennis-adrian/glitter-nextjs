import type { ComponentProps, Ref } from "react";
import { Input } from "@/app/components/ui/input";

const selectClassName =
  "h-10 min-w-0 rounded-md border border-input bg-background px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
};

/** Stores a Bolivia-local ISO value while making the 12-hour clock explicit. */
export default function ActivityDateTimeInput({
  label,
  value,
  onChange,
  ref,
  ...props
}: Props) {
  const [date = "", time = "09:00"] = value.split("T");
  const [hourText = "09", minute = "00"] = time.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const setTime = (nextHour: number, nextMinute = minute) => {
    onChange(`${date}T${String(nextHour).padStart(2, "0")}:${nextMinute}`);
  };
  const accessibleProps = {
    "aria-describedby": props["aria-describedby"],
    "aria-invalid": props["aria-invalid"],
    onBlur: props.onBlur as ComponentProps<"select">["onBlur"],
    disabled: props.disabled,
  };

  return (
    <div className="grid gap-2">
      <Input
        {...props}
        ref={ref}
        type="date"
        required
        value={date}
        onChange={(event) => onChange(`${event.target.value}T${time}`)}
        className="min-w-0 h-10"
      />
      <div className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-2">
        <select
          {...accessibleProps}
          aria-label={`${label}: hora`}
          className={selectClassName}
          value={hour % 12 || 12}
          onChange={(event) =>
            setTime(
              (Number(event.target.value) % 12) + (period === "PM" ? 12 : 0),
            )
          }
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <span aria-hidden="true">:</span>
        <select
          {...accessibleProps}
          aria-label={`${label}: minutos`}
          className={selectClassName}
          value={minute}
          onChange={(event) => setTime(hour, event.target.value)}
        >
          {Array.from({ length: 60 }, (_, index) =>
            String(index).padStart(2, "0"),
          ).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          {...accessibleProps}
          aria-label={`${label}: AM o PM`}
          className={selectClassName}
          value={period}
          onChange={(event) =>
            setTime((hour % 12) + (event.target.value === "PM" ? 12 : 0))
          }
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

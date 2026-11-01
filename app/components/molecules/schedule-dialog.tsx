"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { SCHEDULE_DATE_MESSAGES } from "@/app/lib/comunicados/schedule-rules";
import {
  defaultScheduleValue,
  parseStoreDateTimeLocal,
  toStoreDateTimeLocal,
} from "@/app/lib/schedule-time";

/** What the dialog says when `onConfirm` never answered. */
const CONFIRM_FAILED_TEXT =
  "No pudimos programarlo. Intentá de nuevo en unos minutos.";

export type ScheduleDialogResult =
  | { success: true; message: string }
  | { success: false; message: string };

export type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Under the picker. */
  hint?: ReactNode;
  /** Prefills the picker when a schedule is being moved rather than set. */
  currentScheduledAt?: Date | null;
  /** Default "Programar". */
  confirmLabel?: string;
  /** Default "Programando…". */
  pendingLabel?: string;
  /** Why the picked time will not do, or null; it keeps the button off. */
  validate?: (at: Date) => string | null;
  /** On success the dialog toasts `message`, closes and calls router.refresh(); on failure it shows `message` inline. */
  onConfirm: (at: Date) => Promise<ScheduleDialogResult>;
};

function seedValue(currentScheduledAt?: Date | null): string {
  return currentScheduledAt
    ? toStoreDateTimeLocal(currentScheduledAt)
    : defaultScheduleValue();
}

/**
 * A date and a time, on La Paz's clock. The input is a plain
 * `datetime-local`; `parseStoreDateTimeLocal` reads its value as Bolivia's
 * time whatever the browser's zone.
 */
export function SchedulePicker({
  id,
  value,
  onChange,
  problem,
  disabled = false,
  label = "Fecha y hora",
  hint,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Why this time will not do; shown under the field. */
  problem: string | null;
  disabled?: boolean;
  label?: string;
  hint?: ReactNode;
}) {
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const describedBy = [hint ? hintId : null, problem ? problemId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint && (
        <div id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </div>
      )}
      {problem && (
        <p
          id={problemId}
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * Picks when something happens (docs/IMPLEMENTATION-comunicados.md E5): a
 * blog post's publication, a comunicado's new date. The caller says what the
 * time is for and does it in `onConfirm`; the dialog reads the time as La
 * Paz's, keeps the button off while `validate` objects, and stays open with
 * the answer when it was refused.
 */
export default function ScheduleDialog({
  open,
  onOpenChange,
  title,
  description,
  hint,
  currentScheduledAt,
  confirmLabel = "Programar",
  pendingLabel = "Programando…",
  validate,
  onConfirm,
}: ScheduleDialogProps) {
  const router = useRouter();
  const pickerId = useId();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(() =>
    open ? seedValue(currentScheduledAt) : "",
  );
  /** Why the time picked will not do, by the clock when it was checked. */
  const [problem, setProblem] = useState<string | null>(null);
  /** Why the last confirmation did not go through. */
  const [failure, setFailure] = useState<string | null>(null);
  const [shownOpen, setShownOpen] = useState(open);

  // The dialog stays mounted with the page, so the picker is seeded on each
  // opening rather than once: otherwise the default is frozen at page load,
  // and can land in the past, and a cancelled edit is still there the next
  // time it opens. Seeding here rather than in an effect means an opening
  // never shows the last one's value first.
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setValue(seedValue(currentScheduledAt));
      setProblem(null);
      setFailure(null);
    }
  }

  /** What is wrong with `picked` by the clock now, or null. */
  function check(picked: string) {
    const at = parseStoreDateTimeLocal(picked);
    return at ? (validate?.(at) ?? null) : SCHEDULE_DATE_MESSAGES.invalid;
  }

  function pick(picked: string) {
    setValue(picked);
    setProblem(check(picked));
    setFailure(null);
  }

  function confirm() {
    // Checked again: the clock has moved on since the time was picked, and a
    // seeded time was never checked.
    const at = parseStoreDateTimeLocal(value);
    const current = check(value);
    setProblem(current);
    if (!at || current) return;

    setFailure(null);
    startTransition(async () => {
      let result: ScheduleDialogResult;
      try {
        result = await onConfirm(at);
      } catch (error) {
        console.error("Error confirming a schedule", error);
        setFailure(CONFIRM_FAILED_TEXT);
        return;
      }
      if (!result.success) {
        setFailure(result.message);
        return;
      }
      toast.success(result.message);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <SchedulePicker
          id={pickerId}
          value={value}
          onChange={pick}
          problem={problem}
          disabled={pending}
          hint={hint}
        />

        {failure && (
          <p
            className="rounded-lg border border-[#E8356A] bg-[#E8356A]/10 p-3 text-sm"
            role="alert"
          >
            {failure}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={pending || problem !== null}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

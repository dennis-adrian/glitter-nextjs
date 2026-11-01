"use client";

import { useRouter } from "next/navigation";
import {
  type TransitionStartFunction,
  useEffect,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import ListMemberCell from "@/app/components/communications/admin/list-member-cell";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  previewDistributionListPullAction,
  pullDistributionListMembersAction,
} from "@/app/lib/distribution_lists/actions";
import {
  type DistributionListMember,
  formatAudienceCount,
  pullButtonLabel,
  removedByHandText,
  removedIncludedText,
} from "@/app/lib/distribution_lists/definitions";

type Loaded = {
  candidates: DistributionListMember[];
  removed: DistributionListMember[];
};

function peopleText(count: number) {
  return count === 1 ? "1 persona" : `${formatAudienceCount(count)} personas`;
}

function MemberChoice({
  member,
  checked,
  disabled,
  onCheckedChange,
}: {
  member: DistributionListMember;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = `pull-${member.userId}`;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={`Agregar a ${member.name}`}
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <ListMemberCell member={member} />
      </label>
    </li>
  );
}

type PullProps = {
  listId: number;
  originName: string;
  onOpenChange: (open: boolean) => void;
};

/** The dialog's body, mounted each time it opens, so every choice starts fresh. */
function PullNewMembersBody({
  listId,
  originName,
  onOpenChange,
  isPending,
  startTransition,
}: PullProps & {
  isPending: boolean;
  startTransition: TransitionStartFunction;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<Set<number>>(() => new Set());
  const [includeRemoved, setIncludeRemoved] = useState(false);

  useEffect(() => {
    let current = true;
    previewDistributionListPullAction(listId)
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setLoaded({ candidates: result.candidates, removed: result.removed });
        } else {
          setError(result.message);
        }
      })
      .catch((cause) => {
        console.error("Error previewing a list pull", cause);
        if (current) {
          setError("No pudimos buscar a los nuevos. Intentá de nuevo.");
        }
      });
    return () => {
      current = false;
    };
  }, [listId]);

  const offered = loaded
    ? [...loaded.candidates, ...(includeRemoved ? loaded.removed : [])]
    : [];
  const ticked = offered
    .map((member) => member.userId)
    .filter((id) => !unticked.has(id));

  function toggle(userId: number, checked: boolean) {
    setUnticked((current) => {
      const next = new Set(current);
      if (checked) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function setAll(checked: boolean) {
    setUnticked(
      checked ? new Set() : new Set(offered.map((member) => member.userId)),
    );
  }

  function add() {
    startTransition(async () => {
      try {
        const result = await pullDistributionListMembersAction({
          listId,
          userIds: ticked,
          includeRemoved,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        onOpenChange(false);
        router.refresh();
      } catch (cause) {
        console.error("Error pulling into a distribution list", cause);
        toast.error("No se pudo agregar a las personas. Intentá de nuevo.");
      }
    });
  }

  const nothingNew =
    loaded !== null &&
    loaded.candidates.length === 0 &&
    loaded.removed.length === 0;

  return (
    <>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !loaded ? (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      ) : nothingNew ? (
        <p className="text-sm text-muted-foreground">
          {`No hay nadie nuevo: todos los de «${originName}» ya están en esta lista.`}
        </p>
      ) : (
        <div className="space-y-3">
          {offered.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium tabular-nums">
                  {`${formatAudienceCount(ticked.length)} de ${peopleText(offered.length)}`}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  disabled={isPending}
                  onClick={() => setAll(ticked.length < offered.length)}
                >
                  {ticked.length < offered.length
                    ? "Marcar todas"
                    : "Desmarcar todas"}
                </Button>
              </div>
              <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                {offered.map((member) => (
                  <MemberChoice
                    key={member.userId}
                    member={member}
                    checked={!unticked.has(member.userId)}
                    disabled={isPending}
                    onCheckedChange={(checked) =>
                      toggle(member.userId, checked)
                    }
                  />
                ))}
              </ul>
            </>
          )}
          {loaded.removed.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
              <Checkbox
                id="pull-include-removed"
                checked={includeRemoved}
                disabled={isPending}
                onCheckedChange={(value) => setIncludeRemoved(value === true)}
              />
              <label htmlFor="pull-include-removed" className="space-y-0.5">
                <span className="block">
                  {includeRemoved
                    ? removedIncludedText(loaded.removed.length)
                    : removedByHandText(loaded.removed.length)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Incluirlos
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          {nothingNew || error ? "Cerrar" : "Cancelar"}
        </Button>
        {loaded && !nothingNew && (
          <Button
            type="button"
            disabled={isPending || ticked.length === 0}
            onClick={add}
          >
            {isPending ? "Agregando…" : `Agregar ${peopleText(ticked.length)}`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/**
 * "Traer nuevos de «origen»" (B10): who is in the origin now and not in the
 * copy, all ticked. People removed by hand stay out unless the admin asks.
 */
export default function PullNewMembersDialog({
  open,
  ...props
}: PullProps & { open: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isPending && props.onOpenChange(next)}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pullButtonLabel(props.originName)}</DialogTitle>
          <DialogDescription>
            {`Buscamos a quienes están hoy en «${props.originName}» y no en esta lista. Destildá a quien no quieras agregar.`}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PullNewMembersBody
            {...props}
            isPending={isPending}
            startTransition={startTransition}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

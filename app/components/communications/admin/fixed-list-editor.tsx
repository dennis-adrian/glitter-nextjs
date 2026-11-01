"use client";

import { SaveIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import ListDetailsFields from "@/app/components/communications/admin/list-details-fields";
import ListMemberCell from "@/app/components/communications/admin/list-member-cell";
import ListMemberSearch from "@/app/components/communications/admin/list-member-search";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  addDistributionListMembersAction,
  createDistributionListAction,
  removeDistributionListMemberAction,
  updateDistributionListAction,
} from "@/app/lib/distribution_lists/actions";
import {
  DISTRIBUTION_LIST_ADD_BATCH_MAX,
  DISTRIBUTION_LIST_MAX_MEMBERS,
  type DistributionListMember,
  formatAudienceCount,
} from "@/app/lib/distribution_lists/definitions";

function MembersTotal({ total }: { total: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      {formatAudienceCount(total)} de{" "}
      {formatAudienceCount(DISTRIBUTION_LIST_MAX_MEMBERS)} como máximo.
    </p>
  );
}

function MembersTable({
  members,
  onRemove,
  disabled,
}: {
  members: DistributionListMember[];
  /** Omitted for a list that can no longer change. */
  onRemove?: (member: DistributionListMember) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            {onRemove && (
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.userId}>
              <TableCell className="min-w-64">
                <ListMemberCell member={member} />
              </TableCell>
              {onRemove && (
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onRemove(member)}
                    aria-label={`Quitar a ${member.name}`}
                  >
                    <XIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Quitar
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A new list picked by hand: people are held here and saved with the list,
 * up to what one save takes; the rest are added once it exists.
 */
export function NewFixedListEditor() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<DistributionListMember[]>([]);
  const heldIds = new Set(members.map((member) => member.userId));
  const full = members.length >= DISTRIBUTION_LIST_ADD_BATCH_MAX;

  function save() {
    startTransition(async () => {
      try {
        const result = await createDistributionListAction({
          kind: "fixed",
          name: name.trim(),
          description: description.trim() || null,
          memberIds: members.map((member) => member.userId),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.push(`/dashboard/communications/lists/${result.listId}`);
      } catch (error) {
        console.error("Error creating a distribution list", error);
        toast.error("No se pudo guardar la lista. Intentá de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent>
          <ListDetailsFields
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            disabled={isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Siempre las mismas personas, hasta que las cambies. Solo
            participantes.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ListMemberSearch
            listId={null}
            heldIds={heldIds}
            disabled={isPending || full}
            disabledReason={
              full
                ? `Guardá la lista para agregar más de ${DISTRIBUTION_LIST_ADD_BATCH_MAX}.`
                : undefined
            }
            onPick={(member) => setMembers((current) => [...current, member])}
          />
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no agregaste a nadie.
            </p>
          ) : (
            <MembersTable
              members={members}
              disabled={isPending}
              onRemove={(member) =>
                setMembers((current) =>
                  current.filter((held) => held.userId !== member.userId),
                )
              }
            />
          )}
          <MembersTotal total={members.length} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={save}
        >
          <SaveIcon className="mr-2 h-4 w-4" aria-hidden />
          {isPending ? "Guardando…" : "Guardar lista"}
        </Button>
      </div>
    </div>
  );
}

/**
 * A saved list picked by hand. Name and description are saved with the
 * button; adding or removing someone is saved at once.
 */
export function FixedListEditor({
  listId,
  initialName,
  initialDescription,
  members,
  total,
  readOnly = false,
  pagination,
}: {
  listId: number;
  initialName: string;
  initialDescription: string;
  /** This page of members. */
  members: DistributionListMember[];
  total: number;
  /** An archived list: shown, never changed. */
  readOnly?: boolean;
  pagination?: React.ReactNode;
}) {
  const router = useRouter();
  const [isSaving, startSave] = useTransition();
  const [isChanging, startChange] = useTransition();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const full = total >= DISTRIBUTION_LIST_MAX_MEMBERS;

  function saveDetails() {
    startSave(async () => {
      try {
        const result = await updateDistributionListAction({
          listId,
          name: name.trim(),
          description: description.trim() || null,
        });
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Error updating a distribution list", error);
        toast.error("No se pudieron guardar los cambios. Intentá de nuevo.");
      }
    });
  }

  function add(member: DistributionListMember) {
    startChange(async () => {
      try {
        const result = await addDistributionListMembersAction({
          listId,
          userIds: [member.userId],
        });
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error adding to a distribution list", error);
        toast.error("No se pudo agregar a la persona. Intentá de nuevo.");
      }
    });
  }

  function remove(member: DistributionListMember) {
    startChange(async () => {
      try {
        const result = await removeDistributionListMemberAction({
          listId,
          userIds: [member.userId],
        });
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error removing from a distribution list", error);
        toast.error("No se pudo quitar a la persona. Intentá de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ListDetailsFields
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            disabled={readOnly || isSaving}
          />
          {!readOnly && (
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={isSaving || !name.trim()}
                onClick={saveDetails}
              >
                <SaveIcon className="mr-2 h-4 w-4" aria-hidden />
                {isSaving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!readOnly && (
            <ListMemberSearch
              listId={listId}
              disabled={isChanging || full}
              disabledReason={
                full
                  ? `La lista ya tiene ${formatAudienceCount(DISTRIBUTION_LIST_MAX_MEMBERS)} personas.`
                  : undefined
              }
              onPick={add}
            />
          )}
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay nadie en esta lista.
            </p>
          ) : (
            <MembersTable
              members={members}
              disabled={isChanging}
              onRemove={readOnly ? undefined : remove}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MembersTotal total={total} />
            {pagination}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The credentials calculator (docs/PLAN-credenciales.md §4, §6.2). Pure: no
 * database, `server-only` or React, so the server page, the client toggles,
 * the CSV export and the tests all share it.
 */

import {
  CATEGORY_CREDENTIAL_GROUPS,
  CREDENTIAL_GROUPS,
  CREDENTIAL_NAMING_MODES,
  CREDENTIAL_RULE_QUANTITY_MAX,
  credentialRuleCopy,
  CREDENTIALS_COPY,
  DEFAULT_CREDENTIAL_RULES,
  includesGroup,
  includesStatus,
  isCategoryGroup,
  PRINT_STATE_URGENCY,
  type CategoryCredentialGroup,
  type CountableReservationStatus,
  type CredentialFilters,
  type CredentialGroup,
  type CredentialNamingMode,
  type CredentialRule,
  type CredentialRules,
  type PrintFilter,
  type PrintState,
} from "@/app/lib/credentials/definitions";
import { profileCategoryForStandMatch } from "@/app/lib/reservations/policy";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { getUserName } from "@/app/lib/users/utils";

/* ------------------------------------------------------------------ */
/* Input data (what queries.ts returns)                                */
/* ------------------------------------------------------------------ */

export type CredentialStandRow = {
  id: number;
  label: string | null;
  standNumber: number;
  standCategory: string;
  position: number;
};

export type CredentialReservationRow = {
  id: number;
  status: CountableReservationStatus;
  ownerUserId: number | null;
  /** Active members only (`released_at IS NULL`), any order. */
  stands: CredentialStandRow[];
};

export type CredentialParticipantRow = {
  /** `participations.id`, the print unit's identity. */
  participationId: number;
  reservationId: number;
  user: {
    id: number;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
  };
};

export type CredentialExternalRow = {
  reservationId: number;
  externalParticipantId: number;
  displayName: string;
  /** "Organización social", or the custom label. */
  categoryLabel: string;
};

export type CredentialVolunteerRow = {
  applicationId: number;
  fullName: string;
  roleName: string | null;
};

export type CredentialStaffRow = {
  id: number;
  fullName: string;
  roleLabel: string;
  isActive: boolean;
  /** Has a `festival_staff_members` row for this festival. */
  selected: boolean;
};

export type CredentialExtraRow = {
  id: number;
  name: string | null;
  label: string;
  quantity: number;
};

export type CredentialRuleRow = {
  group: CredentialGroup;
  quantity: number;
  namingMode: CredentialNamingMode | null;
};

export type CredentialExternalOverrideRow = {
  externalParticipantId: number;
  quantity: number;
  standsAtOverride: number;
};

export type CredentialBatchItemRow = {
  unitKey: string;
  group: CredentialGroup;
  userId: number | null;
  printedName: string | null;
  detail: string;
  namedCount: number;
  unnamedCount: number;
  isReprint: boolean;
};

export type CredentialBatchRow = {
  id: number;
  note: string | null;
  createdAt: Date;
  createdByName: string | null;
  items: CredentialBatchItemRow[];
};

export type CredentialsData = {
  festival: { id: number; name: string };
  reservations: CredentialReservationRow[];
  participants: CredentialParticipantRow[];
  externals: CredentialExternalRow[];
  volunteers: CredentialVolunteerRow[];
  /** For the Equipo tab's read-only volunteer card. */
  volunteerCounts: { accepted: number; withoutRole: number; waiting: number };
  /** The active roster plus archived members selected for this festival. */
  staff: CredentialStaffRow[];
  extras: CredentialExtraRow[];
  ruleRows: CredentialRuleRow[];
  externalOverrides: CredentialExternalOverrideRow[];
  /** Oldest first. */
  batches: CredentialBatchRow[];
};

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export type HolderKind = "participant" | "external" | "volunteer" | "staff" | "extra";

/** What print tracking follows (§6.2). */
export type CredentialUnit = {
  key: string;
  group: CredentialGroup;
  userId: number | null;
  /** Null for a unit of unnamed credentials. */
  printedName: string | null;
  detail: string;
  named: number;
  unnamed: number;
};

export type UnitPrint = {
  state: PrintState;
  coveredNamed: number;
  coveredUnnamed: number;
  /** Date of the last item for this unit, reprints included. */
  lastPrintedAt: Date | null;
  /** The last item's printed name differs from the current one. */
  nameChanged: boolean;
};

export type HolderPrint = {
  /** The most urgent of its units (§6.2). */
  state: PrintState;
  lastPrintedAt: Date | null;
  /**
   * Credentials still owed: the delta of `partial` units and the whole of
   * `new` ones, since a holder shows "Faltan" for both together.
   */
  missing: number;
  /** Credentials printed beyond the entitlement, for `surplus`. */
  surplus: number;
  nameChanged: boolean;
  /** New, short, or renamed: what the batch dialog pre-selects. */
  needsPrint: boolean;
  units: Record<string, UnitPrint>;
};

export type CredentialHolder = {
  key: string;
  kind: HolderKind;
  group: CredentialGroup;
  /** The printed name; the label for a lot of unnamed one-off credentials. */
  name: string;
  /** The second line ("Comparte con …", the role). */
  note: string | null;
  standLabel: string | null;
  /** Active stands behind the entitlement: the reservation's, or an external's sum. */
  standCount: number;
  reservationId: number | null;
  /** The reservation's, or for an external the best of its reservations'. */
  reservationStatus: CountableReservationStatus | null;
  /** Every status that brings this holder in (externals can have several). */
  reservationStatuses: CountableReservationStatus[];
  userId: number | null;
  named: number;
  unnamed: number;
  units: CredentialUnit[];
  /** A participant left without credentials by a low quantity: not printable. */
  noCredential: boolean;
  /** Archived roster member, still selected for the festival. */
  archived: boolean;
  /** An external override no longer matches the stands it was saved for. */
  standsChanged: boolean;
  /** Rebuilt from batch items: printed, and no longer in the live data. */
  stale: boolean;
  /** Lowercased, accent-free text for search. */
  searchText: string;
  print: HolderPrint | null;
};

export type CredentialWarning = {
  kind:
    | "duplicate_user"
    | "no_stands"
    | "no_people"
    | "mixed"
    | "no_category"
    | "empty_name"
    | "banned";
  message: string;
  /** Statuses of the reservations involved, to apply the status filter. */
  statuses: CountableReservationStatus[];
  /**
   * For "duplicate_user": the person and each reservation's label with its
   * status, so the message lists only the reservations the filters count.
   */
  duplicate?: {
    name: string;
    reservations: { label: string; status: CountableReservationStatus }[];
  };
};

export type CredentialGroupSummary = {
  group: CredentialGroup;
  rule: string;
  people: number;
  named: number;
  unnamed: number;
  total: number;
};

export type CredentialSummary = {
  rows: CredentialGroupSummary[];
  people: number;
  named: number;
  unnamed: number;
  total: number;
};

export type CredentialSourceCounts = {
  reservations: Record<CountableReservationStatus, number>;
  externals: number;
  volunteers: number;
  staff: number;
};

export type PrintOverview = {
  lastBatch: { id: number; createdAt: Date; sent: number; note: string | null } | null;
  batches: number;
  /** Holders that need printing (new, short or renamed). */
  pendingHolders: number;
  /** Credentials those holders still need. */
  pendingCredentials: number;
  surplusHolders: number;
  staleHolders: number;
  staleCredentials: number;
};

export type CredentialView = {
  rules: CredentialRules;
  /** Filtered holders, stale ones included, sorted for display. */
  holders: CredentialHolder[];
  warnings: CredentialWarning[];
  summary: CredentialSummary;
  sources: CredentialSourceCounts;
  print: PrintOverview;
};

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(CREDENTIAL_RULE_QUANTITY_MAX, Math.trunc(value)));
}

/** The festival's rule rows over the defaults. No row = the default. */
export function resolveRules(rows: readonly CredentialRuleRow[]): CredentialRules {
  const rules = structuredClone(DEFAULT_CREDENTIAL_RULES);
  for (const row of rows) {
    if (!(CREDENTIAL_GROUPS as readonly string[]).includes(row.group)) continue;
    const rule: CredentialRule = {
      quantity: clampQuantity(row.quantity),
      namingMode: DEFAULT_CREDENTIAL_RULES[row.group].namingMode,
    };
    if (
      isCategoryGroup(row.group) &&
      row.namingMode &&
      (CREDENTIAL_NAMING_MODES as readonly string[]).includes(row.namingMode)
    ) {
      rule.namingMode = row.namingMode;
    }
    rules[row.group] = rule;
  }
  return rules;
}

/** Whether a rule equals its group's default (its row can be deleted). */
export function isDefaultRule(group: CredentialGroup, rule: CredentialRule) {
  const fallback = DEFAULT_CREDENTIAL_RULES[group];
  return (
    rule.quantity === fallback.quantity &&
    (!isCategoryGroup(group) || rule.namingMode === fallback.namingMode)
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function spanishList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

const STATUS_RANK: Record<CountableReservationStatus, number> = {
  accepted: 0,
  verification_payment: 1,
  pending: 2,
};

const GROUP_ORDER: Record<CredentialGroup, number> = Object.fromEntries(
  CREDENTIAL_GROUPS.map((group, index) => [group, index]),
) as Record<CredentialGroup, number>;

function standsLabel(stands: readonly CredentialStandRow[]) {
  return stands.map((stand) => formatStandLabel(stand)).join(" y ");
}

/** Splits `total` named credentials evenly, any remainder on the first. */
function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index === 0 ? base + remainder : base,
  );
}

function namedSplit(
  mode: CredentialNamingMode,
  total: number,
  participants: number,
): { named: number[]; unnamed: number } {
  switch (mode) {
    case "one_per_participant": {
      const named = Math.min(participants, total);
      return {
        named: Array.from({ length: participants }, (_, index) =>
          index < named ? 1 : 0,
        ),
        unnamed: total - named,
      };
    }
    case "all_named":
      return { named: splitEvenly(total, participants), unnamed: 0 };
    case "none":
      return { named: Array.from({ length: participants }, () => 0), unnamed: total };
  }
}

/* ------------------------------------------------------------------ */
/* Holders                                                             */
/* ------------------------------------------------------------------ */

export type BuiltHolders = {
  /** Every live holder, all three statuses and every group. */
  holders: CredentialHolder[];
  warnings: CredentialWarning[];
};

type ClassifiedReservation = {
  reservation: CredentialReservationRow;
  stands: CredentialStandRow[];
  group: CredentialGroup;
  label: string;
};

/**
 * Every live holder of the festival, unfiltered (§4). Filters are applied
 * afterwards by `buildView`, so print state is always judged against the
 * whole festival.
 */
export function buildHolders(
  data: Pick<
    CredentialsData,
    | "reservations"
    | "participants"
    | "externals"
    | "volunteers"
    | "staff"
    | "extras"
    | "externalOverrides"
  >,
  rules: CredentialRules,
): BuiltHolders {
  const holders: CredentialHolder[] = [];
  const warnings: CredentialWarning[] = [];

  const participantsByReservation = new Map<number, CredentialParticipantRow[]>();
  for (const participant of data.participants) {
    const list = participantsByReservation.get(participant.reservationId) ?? [];
    list.push(participant);
    participantsByReservation.set(participant.reservationId, list);
  }
  const externalsByReservation = new Map<number, CredentialExternalRow[]>();
  for (const external of data.externals) {
    const list = externalsByReservation.get(external.reservationId) ?? [];
    list.push(external);
    externalsByReservation.set(external.reservationId, list);
  }

  const classified: ClassifiedReservation[] = [];
  const sortedReservations = [...data.reservations].sort((a, b) => a.id - b.id);
  for (const reservation of sortedReservations) {
    const stands = [...reservation.stands].sort((a, b) => a.position - b.position);
    if (stands.length === 0) {
      warnings.push({
        kind: "no_stands",
        message: `La reserva #${reservation.id} no tiene espacios activos y no se cuenta.`,
        statuses: [reservation.status],
      });
      continue;
    }
    const label = standsLabel(stands);
    const participants = participantsByReservation.get(reservation.id) ?? [];
    const externals = externalsByReservation.get(reservation.id) ?? [];
    if (participants.length === 0 && externals.length === 0) {
      warnings.push({
        kind: "no_people",
        message: `La reserva del espacio ${label} no tiene participantes y no se cuenta.`,
        statuses: [reservation.status],
      });
      continue;
    }
    let group: CredentialGroup;
    if (participants.length === 0) {
      group = "external";
    } else {
      const category = profileCategoryForStandMatch(stands[0]!.standCategory);
      if (
        category &&
        (CATEGORY_CREDENTIAL_GROUPS as readonly string[]).includes(category)
      ) {
        group = category as CategoryCredentialGroup;
      } else {
        group = "illustration";
        warnings.push({
          kind: "no_category",
          message: `Espacio sin categoría: ${label} se cuenta como Ilustración.`,
          statuses: [reservation.status],
        });
      }
      if (externals.length > 0) {
        warnings.push({
          kind: "mixed",
          message: `La reserva del espacio ${label} tiene participantes y externos; se cuenta por sus participantes.`,
          statuses: [reservation.status],
        });
      }
    }
    classified.push({ reservation, stands, group, label });
  }

  // Registered participants, per reservation.
  const userReservations = new Map<
    number,
    { name: string; reservations: ClassifiedReservation[] }
  >();
  for (const entry of classified) {
    if (entry.group === "external") continue;
    const { reservation, stands, group, label } = entry;
    const rule = rules[group];
    const total = rule.quantity * stands.length;
    const participants = [...(participantsByReservation.get(reservation.id) ?? [])].sort(
      (a, b) => {
        const aOwner = a.user.id === reservation.ownerUserId ? 0 : 1;
        const bOwner = b.user.id === reservation.ownerUserId ? 0 : 1;
        return aOwner - bOwner || a.participationId - b.participationId;
      },
    );
    const split = namedSplit(rule.namingMode, total, participants.length);
    const names = participants.map((participant) => getUserName(participant.user));

    participants.forEach((participant, index) => {
      const name = names[index]!;
      const named = split.named[index] ?? 0;
      const isFirst = index === 0;
      const unnamed = isFirst ? split.unnamed : 0;
      const units: CredentialUnit[] = [];
      if (named > 0) {
        units.push({
          key: `participant:${participant.participationId}`,
          group,
          userId: participant.user.id,
          printedName: name,
          detail: label,
          named,
          unnamed: 0,
        });
      }
      if (isFirst && split.unnamed > 0) {
        units.push({
          key: `reservation:${reservation.id}`,
          group,
          userId: null,
          printedName: null,
          detail: label,
          named: 0,
          unnamed: split.unnamed,
        });
      }
      const noCredential = named === 0 && unnamed === 0;
      const others = names.filter((_, other) => other !== index).map(
        (other) => other || CREDENTIALS_COPY.emptyName,
      );
      const notes: string[] = [];
      if (noCredential) notes.push(CREDENTIALS_COPY.noCredential);
      if (stands.length > 1) {
        notes.push(
          `${stands.length} espacios, ${plural(total, "credencial", "credenciales")}`,
        );
      }
      if (others.length > 0) notes.push(`Comparte con ${spanishList(others)}`);
      else if (stands.length === 1) notes.push("No comparte espacio");

      holders.push({
        key: `participant:${participant.participationId}`,
        kind: "participant",
        group,
        name: name || CREDENTIALS_COPY.emptyName,
        note: notes.join(" · ") || null,
        standLabel: label,
        standCount: stands.length,
        reservationId: reservation.id,
        reservationStatus: reservation.status,
        reservationStatuses: [reservation.status],
        userId: participant.user.id,
        named,
        unnamed,
        units,
        noCredential,
        archived: false,
        standsChanged: false,
        stale: false,
        searchText: normalizeSearchText(`${name} ${label}`),
        print: null,
      });

      if (!name) {
        warnings.push({
          kind: "empty_name",
          message: `Una persona del espacio ${label} no tiene nombre en su perfil.`,
          statuses: [reservation.status],
        });
      }
      if (participant.user.status === "banned") {
        warnings.push({
          kind: "banned",
          message: `${name || CREDENTIALS_COPY.emptyName} (${label}) tiene la cuenta suspendida.`,
          statuses: [reservation.status],
        });
      }
      const seen = userReservations.get(participant.user.id) ?? {
        name,
        reservations: [],
      };
      seen.reservations.push(entry);
      userReservations.set(participant.user.id, seen);
    });
  }
  for (const { name, reservations } of userReservations.values()) {
    if (reservations.length < 2) continue;
    const listed = reservations.map((entry) => ({
      label: entry.label,
      status: entry.reservation.status,
    }));
    warnings.push({
      kind: "duplicate_user",
      message: duplicateUserMessage(name, listed),
      statuses: listed.map((entry) => entry.status),
      duplicate: { name, reservations: listed },
    });
  }

  // External participants, one holder each across their reservations.
  const overrides = new Map(
    data.externalOverrides.map((row) => [row.externalParticipantId, row]),
  );
  const externalHolders = new Map<
    number,
    { row: CredentialExternalRow; entries: ClassifiedReservation[] }
  >();
  for (const entry of classified) {
    if (entry.group !== "external") continue;
    for (const external of externalsByReservation.get(entry.reservation.id) ?? []) {
      const holder = externalHolders.get(external.externalParticipantId) ?? {
        row: external,
        entries: [],
      };
      holder.entries.push(entry);
      externalHolders.set(external.externalParticipantId, holder);
    }
  }
  for (const [externalId, { row, entries }] of externalHolders) {
    const standCount = entries.reduce((sum, entry) => sum + entry.stands.length, 0);
    const override = overrides.get(externalId);
    const named = override
      ? override.quantity
      : rules.external.quantity * standCount;
    const label = entries.map((entry) => entry.label).join(" y ");
    const statuses = [...new Set(entries.map((entry) => entry.reservation.status))].sort(
      (a, b) => STATUS_RANK[a] - STATUS_RANK[b],
    );
    const name = row.displayName.trim();
    holders.push({
      key: `external:${externalId}`,
      kind: "external",
      group: "external",
      name: name || CREDENTIALS_COPY.emptyName,
      note: row.categoryLabel,
      standLabel: label,
      standCount,
      reservationId: entries[0]!.reservation.id,
      reservationStatus: statuses[0]!,
      reservationStatuses: statuses,
      userId: null,
      named,
      unnamed: 0,
      units:
        named > 0
          ? [
              {
                key: `external:${externalId}`,
                group: "external",
                userId: null,
                printedName: name,
                detail: label,
                named,
                unnamed: 0,
              },
            ]
          : [],
      noCredential: named === 0,
      archived: false,
      standsChanged: Boolean(override && override.standsAtOverride !== standCount),
      stale: false,
      searchText: normalizeSearchText(`${name} ${label} ${row.categoryLabel}`),
      print: null,
    });
    if (!name) {
      warnings.push({
        kind: "empty_name",
        message: `Un participante externo del espacio ${label} no tiene nombre.`,
        statuses,
      });
    }
  }

  // Volunteers.
  for (const volunteer of [...data.volunteers].sort((a, b) => a.applicationId - b.applicationId)) {
    const name = volunteer.fullName.trim();
    const role = volunteer.roleName ?? CREDENTIALS_COPY.noRole;
    const named = rules.volunteer.quantity;
    holders.push(
      simpleHolder({
        key: `volunteer:${volunteer.applicationId}`,
        kind: "volunteer",
        group: "volunteer",
        name,
        note: role,
        named,
      }),
    );
    if (!name) {
      warnings.push({
        kind: "empty_name",
        message: "Una postulación de voluntariado aceptada no tiene nombre.",
        statuses: ["accepted"],
      });
    }
  }

  // The Glitter team: selected for the festival, archived or not.
  for (const member of data.staff) {
    if (!member.selected) continue;
    const holder = simpleHolder({
      key: `staff:${member.id}`,
      kind: "staff",
      group: "staff",
      name: member.fullName.trim(),
      note: member.roleLabel || null,
      named: rules.staff.quantity,
    });
    holder.archived = !member.isActive;
    holders.push(holder);
  }

  // One-off entries: they count exactly what was typed.
  for (const extra of data.extras) {
    if (extra.name != null) {
      holders.push(
        simpleHolder({
          key: `extra:${extra.id}`,
          kind: "extra",
          group: "staff",
          name: extra.name.trim(),
          note: extra.label,
          named: 1,
        }),
      );
    } else {
      const key = `extra:${extra.id}`;
      holders.push({
        ...simpleHolder({
          key,
          kind: "extra",
          group: "staff",
          name: extra.label,
          note: plural(extra.quantity, "credencial sin nombre", "credenciales sin nombre"),
          named: 0,
        }),
        unnamed: extra.quantity,
        noCredential: extra.quantity === 0,
        units:
          extra.quantity > 0
            ? [
                {
                  key,
                  group: "staff",
                  userId: null,
                  printedName: null,
                  detail: extra.label,
                  named: 0,
                  unnamed: extra.quantity,
                },
              ]
            : [],
      });
    }
  }

  return { holders, warnings };
}

function duplicateUserMessage(name: string, reservations: { label: string }[]) {
  return `${name || CREDENTIALS_COPY.emptyName} está en más de una reserva (${spanishList(
    reservations.map((entry) => entry.label),
  )}). Se cuentan todas.`;
}

function simpleHolder({
  key,
  kind,
  group,
  name,
  note,
  named,
}: {
  key: string;
  kind: HolderKind;
  group: CredentialGroup;
  name: string;
  note: string | null;
  named: number;
}): CredentialHolder {
  return {
    key,
    kind,
    group,
    name: name || CREDENTIALS_COPY.emptyName,
    note,
    standLabel: null,
    standCount: 0,
    reservationId: null,
    reservationStatus: null,
    reservationStatuses: [],
    userId: null,
    named,
    unnamed: 0,
    units:
      named > 0
        ? [
            {
              key,
              group,
              userId: null,
              printedName: name,
              detail: note ?? "",
              named,
              unnamed: 0,
            },
          ]
        : [],
    noCredential: named === 0,
    archived: false,
    standsChanged: false,
    stale: false,
    searchText: normalizeSearchText(`${name} ${note ?? ""}`),
    print: null,
  };
}

/* ------------------------------------------------------------------ */
/* Print state (§6.2)                                                  */
/* ------------------------------------------------------------------ */

function mostUrgent(states: PrintState[]): PrintState {
  for (const state of PRINT_STATE_URGENCY) {
    if (states.includes(state)) return state;
  }
  return "new";
}

type UnitHistory = {
  coveredNamed: number;
  coveredUnnamed: number;
  lastPrintedAt: Date;
  last: CredentialBatchItemRow;
};

function unitHistories(batches: readonly CredentialBatchRow[]) {
  const histories = new Map<string, UnitHistory>();
  const ordered = [...batches].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  for (const batch of ordered) {
    for (const item of batch.items) {
      const previous = histories.get(item.unitKey);
      const history = previous ?? {
        coveredNamed: 0,
        coveredUnnamed: 0,
        lastPrintedAt: batch.createdAt,
        last: item,
      };
      const renamed =
        previous != null &&
        previous.coveredNamed + previous.coveredUnnamed > 0 &&
        item.printedName != null &&
        (previous.last.printedName ?? "") !== item.printedName;
      if (renamed) {
        // Printed under a new name: the earlier copies carry the old one, so
        // what this item sends is all that is covered now.
        history.coveredNamed = item.namedCount;
        history.coveredUnnamed = item.unnamedCount;
      } else if (!item.isReprint) {
        history.coveredNamed += item.namedCount;
        history.coveredUnnamed += item.unnamedCount;
      }
      history.lastPrintedAt = batch.createdAt;
      history.last = item;
      histories.set(item.unitKey, history);
    }
  }
  return histories;
}

function unitPrint(unit: CredentialUnit, history: UnitHistory | undefined): UnitPrint {
  if (!history || (history.coveredNamed === 0 && history.coveredUnnamed === 0)) {
    return {
      state: unit.named + unit.unnamed > 0 ? "new" : "printed",
      coveredNamed: history?.coveredNamed ?? 0,
      coveredUnnamed: history?.coveredUnnamed ?? 0,
      lastPrintedAt: history?.lastPrintedAt ?? null,
      nameChanged: false,
    };
  }
  const short =
    history.coveredNamed < unit.named || history.coveredUnnamed < unit.unnamed;
  const over =
    history.coveredNamed > unit.named || history.coveredUnnamed > unit.unnamed;
  const nameChanged =
    unit.printedName != null &&
    (history.last.printedName ?? "") !== unit.printedName;
  if (nameChanged && unit.named + unit.unnamed > 0) {
    // The copies out there carry the old name: the whole entitlement is owed
    // again, which is what the next batch sends (batchItemFor).
    return {
      state: "partial",
      coveredNamed: history.coveredNamed,
      coveredUnnamed: history.coveredUnnamed,
      lastPrintedAt: history.lastPrintedAt,
      nameChanged,
    };
  }
  return {
    state: short ? "partial" : over ? "surplus" : "printed",
    coveredNamed: history.coveredNamed,
    coveredUnnamed: history.coveredUnnamed,
    lastPrintedAt: history.lastPrintedAt,
    nameChanged,
  };
}

/**
 * Attaches print state to every live holder and adds a stale holder for each
 * printed unit that no longer exists. Runs on the unfiltered holders, so a
 * printed pending reservation is not "Ya no corresponde" just because the
 * Pendientes toggle is off.
 */
export function applyPrintState(
  holders: readonly CredentialHolder[],
  batches: readonly CredentialBatchRow[],
): CredentialHolder[] {
  const histories = unitHistories(batches);
  const liveUnits = new Set<string>();
  for (const holder of holders) {
    for (const unit of holder.units) liveUnits.add(unit.key);
  }

  const withState = holders.map((holder) => {
    if (holder.noCredential && holder.units.length === 0) {
      return { ...holder, print: null };
    }
    const units: Record<string, UnitPrint> = {};
    let missing = 0;
    let surplus = 0;
    let lastPrintedAt: Date | null = null;
    let nameChanged = false;
    for (const unit of holder.units) {
      const print = unitPrint(unit, histories.get(unit.key));
      units[unit.key] = print;
      if (print.state === "new") {
        // Owed in full. Alone it reads "Nueva"; next to a short unit the
        // holder reads "Faltan", which must count this one too.
        missing += unit.named + unit.unnamed;
      } else if (print.state === "partial") {
        missing += print.nameChanged
          ? unit.named + unit.unnamed
          : Math.max(0, unit.named - print.coveredNamed) +
            Math.max(0, unit.unnamed - print.coveredUnnamed);
      }
      if (!print.nameChanged && (print.state === "surplus" || print.state === "partial")) {
        surplus +=
          Math.max(0, print.coveredNamed - unit.named) +
          Math.max(0, print.coveredUnnamed - unit.unnamed);
      }
      if (
        print.lastPrintedAt &&
        (!lastPrintedAt || print.lastPrintedAt > lastPrintedAt)
      ) {
        lastPrintedAt = print.lastPrintedAt;
      }
      nameChanged ||= print.nameChanged;
    }
    const state = mostUrgent(Object.values(units).map((unit) => unit.state));
    const print: HolderPrint = {
      state,
      lastPrintedAt,
      missing,
      surplus,
      nameChanged,
      needsPrint: state === "new" || state === "partial" || nameChanged,
      units,
    };
    return { ...holder, print };
  });

  // Printed units that are gone, one holder per unit.
  const stale: CredentialHolder[] = [];
  for (const [unitKey, history] of histories) {
    if (liveUnits.has(unitKey)) continue;
    if (history.coveredNamed === 0 && history.coveredUnnamed === 0) continue;
    const item = history.last;
    const [kindPrefix] = unitKey.split(":");
    const kind: HolderKind =
      kindPrefix === "reservation" ? "participant" : (kindPrefix as HolderKind);
    const name =
      item.printedName ??
      (kindPrefix === "reservation" ? "Credenciales sin nombre" : item.detail);
    const unit: CredentialUnit = {
      key: unitKey,
      group: item.group,
      userId: item.userId,
      printedName: item.printedName,
      detail: item.detail,
      named: 0,
      unnamed: 0,
    };
    stale.push({
      key: unitKey,
      kind,
      group: item.group,
      name,
      note: null,
      standLabel: item.detail || null,
      standCount: 0,
      reservationId: null,
      reservationStatus: null,
      reservationStatuses: [],
      userId: item.userId,
      named: 0,
      unnamed: 0,
      units: [unit],
      noCredential: false,
      archived: false,
      standsChanged: false,
      stale: true,
      searchText: normalizeSearchText(`${name} ${item.detail}`),
      print: {
        state: "stale",
        lastPrintedAt: history.lastPrintedAt,
        missing: 0,
        surplus: history.coveredNamed + history.coveredUnnamed,
        nameChanged: false,
        needsPrint: false,
        units: {
          [unitKey]: {
            state: "stale",
            coveredNamed: history.coveredNamed,
            coveredUnnamed: history.coveredUnnamed,
            lastPrintedAt: history.lastPrintedAt,
            nameChanged: false,
          },
        },
      },
    });
  }

  return [...withState, ...stale];
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

/** Whether a holder is counted under `filters`. Stale ones follow groups only. */
export function holderPassesFilters(
  holder: CredentialHolder,
  filters: CredentialFilters,
): boolean {
  if (!includesGroup(filters, holder.group)) return false;
  if (holder.stale || holder.reservationStatuses.length === 0) return true;
  return holder.reservationStatuses.some((status) => includesStatus(filters, status));
}

function holderSort(a: CredentialHolder, b: CredentialHolder) {
  return (
    Number(a.stale) - Number(b.stale) ||
    GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
    (a.standLabel ?? "~").localeCompare(b.standLabel ?? "~", "es", {
      numeric: true,
    }) ||
    (a.reservationId ?? 0) - (b.reservationId ?? 0) ||
    (a.kind === "participant" && b.kind === "participant"
      ? 0
      : a.name.localeCompare(b.name, "es"))
  );
}

export function summarize(
  holders: readonly CredentialHolder[],
  rules: CredentialRules,
  filters: CredentialFilters,
): CredentialSummary {
  const rows: CredentialGroupSummary[] = CREDENTIAL_GROUPS.filter((group) =>
    includesGroup(filters, group),
  ).map((group) => {
    const live = holders.filter((holder) => holder.group === group && !holder.stale);
    const named = live.reduce((sum, holder) => sum + holder.named, 0);
    const unnamed = live.reduce((sum, holder) => sum + holder.unnamed, 0);
    return {
      group,
      rule: credentialRuleCopy(group, rules[group]),
      // A lot of unnamed one-off credentials is not a person, nor is a
      // participant a low quantity left without credentials ("Sin credencial").
      people: live.filter(
        (holder) => !(holder.kind === "extra" && holder.named === 0) && !holder.noCredential,
      ).length,
      named,
      unnamed,
      total: named + unnamed,
    };
  });
  const sum = (key: "people" | "named" | "unnamed" | "total") =>
    rows.reduce((total, row) => total + row[key], 0);
  return {
    rows,
    people: sum("people"),
    named: sum("named"),
    unnamed: sum("unnamed"),
    total: sum("total"),
  };
}

function sourceCounts(
  data: Pick<CredentialsData, "reservations" | "externals" | "volunteers" | "staff">,
  holders: readonly CredentialHolder[],
): CredentialSourceCounts {
  const reservations: Record<CountableReservationStatus, number> = {
    accepted: 0,
    verification_payment: 0,
    pending: 0,
  };
  const counted = new Set(
    holders
      .filter((holder) => holder.kind === "participant" && !holder.stale)
      .map((holder) => holder.reservationId),
  );
  for (const reservation of data.reservations) {
    if (counted.has(reservation.id)) reservations[reservation.status] += 1;
  }
  return {
    reservations,
    externals: holders.filter((holder) => holder.kind === "external" && !holder.stale)
      .length,
    volunteers: holders.filter((holder) => holder.kind === "volunteer").length,
    staff: holders.filter(
      (holder) => holder.group === "staff" && !holder.stale && holder.kind === "staff",
    ).length,
  };
}

/**
 * The festival's most recent batch, as "undo" orders it. Its id is the print
 * history's version: a batch request names the one it saw (§6.3).
 */
export function latestBatch<T extends Pick<CredentialBatchRow, "id" | "createdAt">>(
  batches: readonly T[],
): T | null {
  return batches.length
    ? [...batches].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
      )[0]!
    : null;
}

function printOverview(
  batches: readonly CredentialBatchRow[],
  holders: readonly CredentialHolder[],
): PrintOverview {
  const last = latestBatch(batches);
  const live = holders.filter((holder) => !holder.stale && holder.print);
  const pending = live.filter((holder) => holder.print!.needsPrint);
  const stale = holders.filter((holder) => holder.stale);
  return {
    lastBatch: last
      ? {
          id: last.id,
          createdAt: last.createdAt,
          note: last.note,
          sent: last.items.reduce(
            (sum, item) => sum + item.namedCount + item.unnamedCount,
            0,
          ),
        }
      : null,
    batches: batches.length,
    pendingHolders: pending.length,
    pendingCredentials: pending.reduce(
      (sum, holder) => sum + batchCountsFor(holder).named + batchCountsFor(holder).unnamed,
      0,
    ),
    surplusHolders: live.filter((holder) => holder.print!.state === "surplus").length,
    staleHolders: stale.length,
    staleCredentials: stale.reduce((sum, holder) => sum + (holder.print?.surplus ?? 0), 0),
  };
}

/**
 * The page and the CSV export both come from here, so they cannot disagree.
 * Print state is computed on every holder first; filters come after.
 */
export function buildView(
  data: CredentialsData,
  rules: CredentialRules,
  filters: CredentialFilters,
): CredentialView {
  const built = buildHolders(data, rules);
  const all = applyPrintState(built.holders, data.batches);
  const holders = all.filter((holder) => holderPassesFilters(holder, filters));
  holders.sort(holderSort);
  const warnings = built.warnings.flatMap((warning) => {
    if (warning.duplicate) {
      // Only the reservations the filters count: a duplicate needs two.
      const counted = warning.duplicate.reservations.filter((entry) =>
        includesStatus(filters, entry.status),
      );
      if (counted.length < 2) return [];
      return [
        {
          ...warning,
          message: duplicateUserMessage(warning.duplicate.name, counted),
          statuses: counted.map((entry) => entry.status),
          duplicate: { ...warning.duplicate, reservations: counted },
        },
      ];
    }
    const included = warning.statuses.filter((status) => includesStatus(filters, status));
    return included.length > 0 ? [warning] : [];
  });
  return {
    rules,
    holders,
    warnings,
    summary: summarize(holders, rules, filters),
    sources: sourceCounts(data, all),
    print: printOverview(data.batches, holders),
  };
}

/* ------------------------------------------------------------------ */
/* Batches and the Nombres filter                                      */
/* ------------------------------------------------------------------ */

/**
 * A unit's delta for a new batch (§6.3 step 4). A renamed unit goes out in
 * full under its current name, as a reprint, whatever its state: its earlier
 * copies carry the old name, and any increase is printed with them.
 */
export function batchItemFor(
  unit: CredentialUnit,
  print: UnitPrint | undefined,
): { named: number; unnamed: number; isReprint: boolean } {
  const state = print?.state ?? "new";
  if (print?.nameChanged) {
    return { named: unit.named, unnamed: unit.unnamed, isReprint: true };
  }
  if (state === "partial") {
    return {
      named: Math.max(0, unit.named - (print?.coveredNamed ?? 0)),
      unnamed: Math.max(0, unit.unnamed - (print?.coveredUnnamed ?? 0)),
      isReprint: false,
    };
  }
  if (state === "printed" || state === "surplus") {
    return { named: unit.named, unnamed: unit.unnamed, isReprint: true };
  }
  return { named: unit.named, unnamed: unit.unnamed, isReprint: false };
}

/** One unit as a new batch would write it. */
export type BatchItemPlan = {
  unit: CredentialUnit;
  named: number;
  unnamed: number;
  isReprint: boolean;
};

/**
 * The items putting this holder in a batch writes. A holder that needs
 * printing sends only its units that do: new ones in full, short ones the
 * difference, renamed ones again as a reprint; its units already printed
 * stay out. A holder with nothing left to print is a reprint of every unit.
 */
export function batchItemsFor(holder: CredentialHolder): BatchItemPlan[] {
  const plans: BatchItemPlan[] = [];
  const needsPrint = holder.print?.needsPrint ?? true;
  for (const unit of holder.units) {
    if (unit.named + unit.unnamed === 0) continue;
    const print = holder.print?.units[unit.key];
    const state = print?.state ?? "new";
    const owed = state === "new" || state === "partial" || Boolean(print?.nameChanged);
    if (needsPrint && !owed) continue;
    const item = batchItemFor(unit, print);
    if (item.named + item.unnamed === 0) continue;
    plans.push({ unit, ...item });
  }
  return plans;
}

/** What putting this holder in a batch sends, all units together. */
export function batchCountsFor(holder: CredentialHolder): {
  named: number;
  unnamed: number;
  reprint: boolean;
} {
  let named = 0;
  let unnamed = 0;
  let reprint = false;
  for (const item of batchItemsFor(holder)) {
    named += item.named;
    unnamed += item.unnamed;
    reprint ||= item.isReprint;
  }
  return { named, unnamed, reprint };
}

/** Whether a holder can go in a batch at all. */
export function isPrintable(holder: CredentialHolder): boolean {
  return !holder.stale && holder.units.some((unit) => unit.named + unit.unnamed > 0);
}

export function matchesPrintFilter(holder: CredentialHolder, filter: PrintFilter) {
  if (filter === "todas") return true;
  if (filter === "baja") return holder.stale;
  if (!holder.print || holder.stale) return false;
  if (filter === "pendientes") return holder.print.needsPrint;
  return !holder.print.needsPrint && holder.print.lastPrintedAt != null;
}

export function matchesSearch(holder: CredentialHolder, query: string) {
  const needle = normalizeSearchText(query);
  return needle === "" || holder.searchText.includes(needle);
}

/**
 * The names "Copiar nombres" copies: one line per named credential, so a
 * gastronomy name appears twice.
 */
export function namesToCopy(holders: readonly CredentialHolder[]): string[] {
  const lines: string[] = [];
  for (const holder of holders) {
    if (holder.stale) continue;
    for (const unit of holder.units) {
      if (!unit.printedName) continue;
      for (let index = 0; index < unit.named; index += 1) lines.push(unit.printedName);
    }
  }
  return lines;
}

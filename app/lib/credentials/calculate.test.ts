import { describe, expect, it } from "vitest";

import {
  clasifyCredentials,
  type Category,
  type CredentialData,
} from "@/app/lib/credentials/__fixtures__/credentials-classifier";
import {
  addExternal,
  addReservation,
  batch,
  emptyData,
} from "@/app/lib/credentials/__fixtures__/data";
import {
  batchItemsFor,
  buildHolders,
  buildView,
  isDefaultRule,
  isPrintable,
  matchesPrintFilter,
  namesToCopy,
  resolveRules,
  type CredentialsData,
} from "@/app/lib/credentials/calculate";
import {
  DEFAULT_CREDENTIAL_FILTERS,
  DEFAULT_CREDENTIAL_RULES,
  type CredentialFilters,
} from "@/app/lib/credentials/definitions";
import { printStateLabel } from "@/app/lib/credentials/print-labels";

const ALL: CredentialFilters = {
  statuses: { verification_payment: true, pending: true },
  groups: { external: true, volunteer: true, staff: true },
};

function counts(data: CredentialsData, rules = DEFAULT_CREDENTIAL_RULES) {
  const { holders } = buildHolders(data, rules);
  return {
    named: holders.reduce((sum, holder) => sum + holder.named, 0),
    unnamed: holders.reduce((sum, holder) => sum + holder.unnamed, 0),
  };
}

describe("the worked results (§4.1)", () => {
  const cases: [string, string, number, number, number, number][] = [
    ["illustration, one participant, one stand", "illustration", 1, 1, 1, 1],
    ["illustration, two participants, one stand", "illustration", 2, 1, 2, 0],
    ["illustration, one participant, two stands", "illustration", 1, 2, 1, 3],
    ["illustration, two participants, two stands", "illustration", 2, 2, 2, 2],
    ["entrepreneurship, one stand", "entrepreneurship", 1, 1, 1, 1],
    ["entrepreneurship, two stands", "entrepreneurship", 1, 2, 1, 3],
    ["gastronomy, one stand", "gastronomy", 1, 1, 2, 0],
    ["gastronomy, two stands", "gastronomy", 1, 2, 4, 0],
  ];
  it.each(cases)("%s", (_, category, people, stands, named, unnamed) => {
    const data = emptyData();
    addReservation(data, {
      category,
      stands,
      people: Array.from({ length: people }, (_, index) => ({ name: `P${index}` })),
    });
    expect(counts(data)).toEqual({ named, unnamed });
  });
});

describe("parity with credentials-classifier", () => {
  it("gives the old tool's totals for single-stand reservations", () => {
    const rows: CredentialData[] = [];
    const data = emptyData();
    const layout: [Category, number][] = [
      ["illustration", 1],
      ["illustration", 2],
      ["illustration", 1],
      ["illustration", 2],
      ["illustration", 1],
      ["entrepreneurship", 1],
      ["entrepreneurship", 1],
      ["entrepreneurship", 1],
      ["gastronomy", 1],
      ["gastronomy", 1],
    ];
    layout.forEach(([category, people], index) => {
      const stand = `S${index + 1}`;
      const names = Array.from({ length: people }, (_, p) => `${stand}-${p}`);
      names.forEach((participant) => rows.push({ category, participant, stand }));
      addReservation(data, {
        category,
        people: names.map((name) => ({ name })),
        firstNumber: index + 1,
      });
    });

    const old = clasifyCredentials(rows);
    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    for (const category of ["illustration", "entrepreneurship", "gastronomy"] as const) {
      const row = view.summary.rows.find((entry) => entry.group === category)!;
      expect({ named: row.named, unnamed: row.unnamed }).toEqual({
        named: old[category].namedCredentialsCount,
        unnamed: old[category].unamedCredentialsCount,
      });
    }
    expect(view.summary.total).toBe(
      Object.values(old).reduce(
        (sum, entry) => sum + entry.namedCredentialsCount + entry.unamedCredentialsCount,
        0,
      ),
    );
  });
});

describe("rules", () => {
  it("resolves rows over the defaults and ignores naming mode outside categories", () => {
    const rules = resolveRules([
      { group: "illustration", quantity: 3, namingMode: "all_named" },
      { group: "volunteer", quantity: 2, namingMode: "none" },
      { group: "staff", quantity: 99, namingMode: null },
    ]);
    expect(rules.illustration).toEqual({ quantity: 3, namingMode: "all_named" });
    expect(rules.volunteer).toEqual({ quantity: 2, namingMode: "all_named" });
    expect(rules.staff.quantity).toBe(20);
    expect(rules.gastronomy).toEqual(DEFAULT_CREDENTIAL_RULES.gastronomy);
    expect(isDefaultRule("volunteer", { quantity: 1, namingMode: "none" })).toBe(true);
    expect(isDefaultRule("gastronomy", { quantity: 2, namingMode: "none" })).toBe(false);
  });

  it("applies each naming mode", () => {
    const data = emptyData();
    addReservation(data, {
      category: "gastronomy",
      stands: 2,
      people: [{ name: "Ana" }, { name: "Beto" }, { name: "Caro" }],
    });
    const allNamed = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders;
    // 4 named split evenly, the remainder on the first.
    expect(allNamed.map((holder) => holder.named)).toEqual([2, 1, 1]);
    const none = buildHolders(
      data,
      resolveRules([{ group: "gastronomy", quantity: 2, namingMode: "none" }]),
    ).holders;
    expect(none.map((holder) => [holder.named, holder.unnamed])).toEqual([
      [0, 4],
      [0, 0],
      [0, 0],
    ]);
  });

  it("leaves a participant without credential when the quantity is below the people", () => {
    const data = emptyData();
    addReservation(data, {
      people: [{ name: "Titular" }, { name: "Socia" }],
    });
    const { holders } = buildHolders(
      data,
      resolveRules([{ group: "illustration", quantity: 1, namingMode: null }]),
    );
    expect(holders.map((holder) => [holder.name, holder.named, holder.noCredential])).toEqual([
      ["Titular", 1, false],
      ["Socia", 0, true],
    ]);
    expect(holders[1]!.units).toEqual([]);
    expect(holders[1]!.note).toContain("Sin credencial");
  });
});

describe("participants", () => {
  it("puts the titular first, then the rest by participation id", () => {
    const data = emptyData();
    addReservation(data, {
      people: [
        { name: "Primera", participationId: 1 },
        { name: "Titular", participationId: 2 },
      ],
      owner: 1,
      stands: 2,
    });
    const { holders } = buildHolders(data, DEFAULT_CREDENTIAL_RULES);
    expect(holders.map((holder) => holder.name)).toEqual(["Titular", "Primera"]);
    // The reservation's unnamed credentials sit on the titular's row as their own unit.
    expect(holders[0]!.units.map((unit) => unit.key)).toEqual([
      "participant:2",
      expect.stringMatching(/^reservation:/),
    ]);
    expect(holders[0]!.unnamed).toBe(2);
  });

  it("orders by participation id when the owner is not a participant", () => {
    const data = emptyData();
    addReservation(data, {
      people: [
        { name: "Segunda", participationId: 9 },
        { name: "Primera", participationId: 3 },
      ],
      owner: { userId: 777 },
    });
    expect(
      buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders.map((holder) => holder.name),
    ).toEqual(["Primera", "Segunda"]);
  });

  it("rules new_artist stands as illustration and none stands as illustration with a warning", () => {
    const data = emptyData();
    addReservation(data, { category: "new_artist", people: [{ name: "Nueva" }] });
    addReservation(data, { category: "none", people: [{ name: "Sin" }] });
    const { holders, warnings } = buildHolders(data, DEFAULT_CREDENTIAL_RULES);
    expect(holders.map((holder) => holder.group)).toEqual(["illustration", "illustration"]);
    expect(warnings.map((warning) => warning.kind)).toEqual(["no_category"]);
    expect(warnings[0]!.message).toContain("Espacio sin categoría");
  });

  it("writes the second line", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Sola" }] });
    addReservation(data, { people: [{ name: "Uno" }, { name: "Dos" }] });
    addReservation(data, { people: [{ name: "Mesa" }], stands: 2 });
    const notes = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders.map(
      (holder) => holder.note,
    );
    expect(notes).toEqual([
      "No comparte espacio",
      "Comparte con Dos",
      "Comparte con Uno",
      "2 espacios, 4 credenciales",
    ]);
  });

  it("tolerates a participant whose reservation was not loaded", () => {
    const data = emptyData();
    data.participants.push({
      participationId: 5,
      reservationId: 404,
      user: { id: 1, displayName: "Huérfana", firstName: null, lastName: null, status: "verified" },
    });
    expect(buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders).toEqual([]);
  });
});

describe("externals, volunteers, staff and extras", () => {
  it("counts an external-only reservation per stand, with the organization's name", () => {
    const data = emptyData();
    addExternal(data, { externalId: 7, name: "Refugio Huellitas", stands: 2 });
    const [holder] = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders;
    expect(holder).toMatchObject({
      key: "external:7",
      group: "external",
      name: "Refugio Huellitas",
      named: 4,
      unnamed: 0,
    });
  });

  it("sums an external's reservations and applies its override", () => {
    const data = emptyData();
    addExternal(data, { externalId: 7, name: "Alcaldía" });
    data.reservations.push({
      id: 8001,
      status: "accepted",
      ownerUserId: null,
      stands: [{ id: 1, label: "D", standNumber: 9, standCategory: "illustration", position: 0 }],
    });
    data.externals.push({
      reservationId: 8001,
      externalParticipantId: 7,
      displayName: "Alcaldía",
      categoryLabel: "Entidad pública",
    });
    expect(buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders[0]!.named).toBe(4);

    data.externalOverrides.push({ externalParticipantId: 7, quantity: 3, standsAtOverride: 2 });
    const overridden = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders[0]!;
    expect(overridden.named).toBe(3);
    expect(overridden.standsChanged).toBe(false);

    data.externalOverrides[0]!.standsAtOverride = 1;
    expect(buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders[0]!.standsChanged).toBe(true);
  });

  it("rules a mixed reservation by its registered participants, with a warning", () => {
    const data = emptyData();
    const { reservationId } = addReservation(data, {
      category: "entrepreneurship",
      people: [{ name: "Registrada" }],
    });
    data.externals.push({
      reservationId,
      externalParticipantId: 3,
      displayName: "Marca",
      categoryLabel: "Marca invitada",
    });
    const { holders, warnings } = buildHolders(data, DEFAULT_CREDENTIAL_RULES);
    expect(holders.map((holder) => holder.kind)).toEqual(["participant"]);
    expect(warnings.map((warning) => warning.kind)).toEqual(["mixed"]);
  });

  it("names volunteers with their role or Sin rol", () => {
    const data = emptyData();
    data.volunteers.push(
      { applicationId: 1, fullName: "Camila Rojas", roleName: "Acreditación" },
      { applicationId: 2, fullName: "Diego Paz", roleName: null },
    );
    const holders = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders;
    expect(holders.map((holder) => [holder.name, holder.note, holder.named])).toEqual([
      ["Camila Rojas", "Acreditación", 1],
      ["Diego Paz", "Sin rol", 1],
    ]);
  });

  it("counts selected staff, archived included, and extras as typed", () => {
    const data = emptyData();
    data.staff.push(
      { id: 1, fullName: "Daniela Arce", roleLabel: "Dirección", isActive: true, selected: true },
      { id: 2, fullName: "Pablo Terán", roleLabel: "Sonido", isActive: true, selected: false },
      { id: 3, fullName: "Archivada", roleLabel: "Diseño", isActive: false, selected: true },
    );
    data.extras.push(
      { id: 1, name: "Marcelo Peredo", label: "Fotografía", quantity: 1 },
      { id: 2, name: null, label: "Prensa", quantity: 6 },
    );
    const holders = buildHolders(data, DEFAULT_CREDENTIAL_RULES).holders;
    expect(holders.map((holder) => [holder.key, holder.named, holder.unnamed])).toEqual([
      ["staff:1", 1, 0],
      ["staff:3", 1, 0],
      ["extra:1", 1, 0],
      ["extra:2", 0, 6],
    ]);
    expect(holders[1]!.archived).toBe(true);

    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    const staffRow = view.summary.rows.find((row) => row.group === "staff")!;
    // The Prensa lot is not a person.
    expect(staffRow).toMatchObject({ people: 3, named: 3, unnamed: 6, total: 9 });
  });
});

describe("warnings", () => {
  it("reports every case of §4.5", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Doble", userId: 50 }] });
    addReservation(data, { people: [{ name: "Doble", userId: 50 }], category: "gastronomy" });
    data.reservations.push({ id: 9001, status: "accepted", ownerUserId: null, stands: [] });
    data.reservations.push({
      id: 9002,
      status: "accepted",
      ownerUserId: null,
      stands: [{ id: 1, label: "Z", standNumber: 1, standCategory: "illustration", position: 0 }],
    });
    addReservation(data, { people: [{ name: "" }] });
    addReservation(data, { people: [{ name: "Suspendida", status: "banned" }] });
    addReservation(data, { category: "none", people: [{ name: "Sin categoría" }] });

    const kinds = buildHolders(data, DEFAULT_CREDENTIAL_RULES).warnings.map(
      (warning) => warning.kind,
    );
    expect(new Set(kinds)).toEqual(
      new Set(["duplicate_user", "no_stands", "no_people", "empty_name", "banned", "no_category"]),
    );
  });

  it("only warns about duplicates among counted reservations", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Doble", userId: 50 }] });
    addReservation(data, { people: [{ name: "Doble", userId: 50 }], status: "pending" });
    const kinds = (filters: CredentialFilters) =>
      buildView(data, DEFAULT_CREDENTIAL_RULES, filters).warnings.map((warning) => warning.kind);
    expect(kinds(DEFAULT_CREDENTIAL_FILTERS)).toEqual([]);
    expect(kinds(ALL)).toEqual(["duplicate_user"]);
  });
});

describe("buildView", () => {
  it("applies status and group filters after building", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Confirmada" }] });
    addReservation(data, { people: [{ name: "Verificando" }], status: "verification_payment" });
    addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
    addExternal(data, { name: "Externa" });
    data.volunteers.push({ applicationId: 1, fullName: "Vol", roleName: null });

    const names = (filters: CredentialFilters) =>
      buildView(data, DEFAULT_CREDENTIAL_RULES, filters).holders.map((holder) => holder.name);
    expect(names(DEFAULT_CREDENTIAL_FILTERS)).toEqual(["Confirmada", "Externa", "Vol"]);
    expect(names(ALL)).toEqual(["Confirmada", "Verificando", "Pendiente", "Externa", "Vol"]);
    expect(
      names({
        ...DEFAULT_CREDENTIAL_FILTERS,
        groups: { external: false, volunteer: false, staff: true },
      }),
    ).toEqual(["Confirmada"]);

    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    expect(view.sources.reservations).toEqual({
      accepted: 1,
      verification_payment: 1,
      pending: 1,
    });
    expect(view.summary.total).toBe(2 + 2 + 1);
  });

  it("copies one line per named credential", () => {
    const data = emptyData();
    addReservation(data, { category: "gastronomy", people: [{ name: "Cocina" }] });
    addReservation(data, { people: [{ name: "Ilu" }] });
    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    expect(namesToCopy(view.holders)).toEqual(["Ilu", "Cocina", "Cocina"]);
  });
});

/* ------------------------------------------------------------------ */
/* Print state (§6.2)                                                  */
/* ------------------------------------------------------------------ */

let batchClock = Date.UTC(2026, 10, 14, 15);

/** Records a batch the way createCredentialPrintBatch does. */
function print(data: CredentialsData, keys?: string[]) {
  const holders = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).holders.filter(
    (holder) => isPrintable(holder) && (keys ? keys.includes(holder.key) : holder.print!.needsPrint),
  );
  const items = holders.flatMap((holder) =>
    batchItemsFor(holder).map((plan) => ({
      unitKey: plan.unit.key,
      group: plan.unit.group,
      userId: plan.unit.userId,
      printedName: plan.unit.printedName,
      detail: plan.unit.detail,
      namedCount: plan.named,
      unnamedCount: plan.unnamed,
      isReprint: plan.isReprint,
    })),
  );
  batchClock += 86_400_000;
  data.batches.push(batch(items, new Date(batchClock)));
  return items;
}

function holderOf(data: CredentialsData, name: string, filters = ALL) {
  return buildView(data, DEFAULT_CREDENTIAL_RULES, filters).holders.find(
    (holder) => holder.name === name,
  );
}

function standRow(id: number, number: number, position: number) {
  return { id, label: "A", standNumber: number, standCategory: "illustration", position };
}

describe("print state", () => {
  it("is new before any batch, printed after, with the batch's date", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Camila" }] });
    expect(holderOf(data, "Camila")!.print).toMatchObject({ state: "new", needsPrint: true });
    print(data);
    const printed = holderOf(data, "Camila")!.print!;
    expect(printed).toMatchObject({ state: "printed", needsPrint: false });
    expect(printStateLabel(printed)).toBe("Impresa el 15 nov");
  });

  it("prints 2, grows to 4, tops up, grows to 6: Faltan 2", () => {
    const data = emptyData();
    const { reservationId } = addReservation(data, { people: [{ name: "Diego" }] });
    const reservation = data.reservations.find((entry) => entry.id === reservationId)!;
    print(data);
    reservation.stands.push(standRow(9001, 90, 1));
    let diego = holderOf(data, "Diego")!;
    expect(diego.print).toMatchObject({ state: "partial", missing: 2 });
    expect(printStateLabel(diego.print!)).toBe("Faltan 2");
    // The top-up sends only the 2 that are missing.
    const items = print(data);
    expect(items).toEqual([
      expect.objectContaining({ unitKey: `reservation:${reservationId}`, unnamedCount: 2, isReprint: false }),
    ]);
    expect(holderOf(data, "Diego")!.print!.state).toBe("printed");
    reservation.stands.push(standRow(9002, 91, 2));
    diego = holderOf(data, "Diego")!;
    expect(printStateLabel(diego.print!)).toBe("Faltan 2");
  });

  it("says Sobran when a stand is released after printing", () => {
    const data = emptyData();
    const { reservationId } = addReservation(data, { people: [{ name: "Mesa" }], stands: 2 });
    print(data);
    data.reservations.find((entry) => entry.id === reservationId)!.stands.pop();
    const mesa = holderOf(data, "Mesa")!;
    expect(mesa.print).toMatchObject({ state: "surplus", surplus: 2, needsPrint: false });
    expect(printStateLabel(mesa.print!)).toBe("Sobran 2");
  });

  it("keeps the titular printed when a partner joins a printed solo stand", () => {
    const data = emptyData();
    const { reservationId } = addReservation(data, {
      people: [{ name: "Titular", participationId: 1 }],
    });
    print(data);
    data.participants.push({
      participationId: 2,
      reservationId,
      user: { id: 77, displayName: "Socia", firstName: null, lastName: null, status: "verified" },
    });
    const titular = holderOf(data, "Titular")!;
    // The titular's named one stays printed. Sharing leaves the reservation no
    // unnamed credential, so the printed one shows apart as no longer owed,
    // instead of moving onto someone's row.
    expect(titular.print!.state).toBe("printed");
    const stale = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).holders.filter((h) => h.stale);
    expect(stale.map((holder) => holder.key)).toEqual([`reservation:${reservationId}`]);
    expect(holderOf(data, "Socia")!.print!.state).toBe("new");
    expect(batchItemsFor(holderOf(data, "Socia")!)).toHaveLength(1);
  });

  it("stays printed when a participation moves to the same person's new account", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Lucía", participationId: 5, userId: 10 }] });
    print(data);
    data.participants[0]!.user.id = 11;
    expect(holderOf(data, "Lucía")!.print!.state).toBe("printed");
  });

  it("says Cambió el nombre when an admin replaces the partner, and reprints it", () => {
    const data = emptyData();
    addReservation(data, {
      people: [{ name: "Titular" }, { name: "Socio", participationId: 8 }],
    });
    print(data);
    data.participants.find((row) => row.participationId === 8)!.user = {
      id: 99,
      displayName: "Socia nueva",
      firstName: null,
      lastName: null,
      status: "verified",
    };
    const replaced = holderOf(data, "Socia nueva")!;
    expect(replaced.print).toMatchObject({ state: "printed", nameChanged: true, needsPrint: true });
    expect(printStateLabel(replaced.print!)).toBe("Cambió el nombre");
    const items = print(data, [replaced.key]);
    expect(items).toEqual([expect.objectContaining({ printedName: "Socia nueva", isReprint: true })]);
    expect(holderOf(data, "Socia nueva")!.print).toMatchObject({ nameChanged: false, needsPrint: false });
  });

  it("does not count reprints as coverage", () => {
    const data = emptyData();
    const { reservationId } = addReservation(data, { people: [{ name: "Gas" }], category: "gastronomy" });
    data.batches.push(
      batch([
        {
          unitKey: `participant:${data.participants[0]!.participationId}`,
          group: "gastronomy",
          userId: null,
          printedName: "Gas",
          detail: "",
          namedCount: 2,
          unnamedCount: 0,
          isReprint: true,
        },
      ]),
    );
    expect(holderOf(data, "Gas")!.print!.state).toBe("new");
    expect(reservationId).toBeGreaterThan(0);
    // A printed holder added again goes out whole, as a reprint.
    print(data);
    const reprint = print(data, [holderOf(data, "Gas")!.key]);
    expect(reprint).toEqual([expect.objectContaining({ namedCount: 2, isReprint: true })]);
    expect(holderOf(data, "Gas")!.print!.state).toBe("printed");
  });

  it("turns a cancelled printed reservation into Ya no corresponde, but not a hidden pending one", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Renata" }] });
    addReservation(data, { people: [{ name: "Pendiente" }], status: "pending" });
    print(data);
    // The pending toggle off: still printed, not stale.
    const visible = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS).holders;
    expect(visible.some((holder) => holder.name === "Pendiente")).toBe(false);
    expect(visible.filter((holder) => holder.stale)).toEqual([]);

    // Renata's reservation is cancelled: it leaves the live data.
    data.reservations.splice(0, 1);
    const view = buildView(data, DEFAULT_CREDENTIAL_RULES, DEFAULT_CREDENTIAL_FILTERS);
    const stale = view.holders.filter((holder) => holder.stale);
    expect(stale.map((holder) => [holder.name, holder.print!.state])).toEqual([
      ["Renata", "stale"],
      ["Credenciales sin nombre", "stale"],
    ]);
    expect(printStateLabel(stale[0]!.print!)).toBe("Ya no corresponde");
    expect(view.print.staleHolders).toBe(2);
    expect(view.print.staleCredentials).toBe(2);
    expect(isPrintable(stale[0]!)).toBe(false);
  });

  it("summarises the last batch and what changed since", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Una" }] });
    expect(buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).print.lastBatch).toBeNull();
    print(data);
    addReservation(data, { people: [{ name: "Otra" }], category: "gastronomy" });
    const overview = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).print;
    expect(overview).toMatchObject({
      batches: 1,
      pendingHolders: 1,
      pendingCredentials: 2,
      lastBatch: expect.objectContaining({ sent: 2 }),
    });
  });

  it("filters Nombres by print state", () => {
    const data = emptyData();
    addReservation(data, { people: [{ name: "Impresa" }] });
    print(data);
    addReservation(data, { people: [{ name: "Nueva" }] });
    const holders = buildView(data, DEFAULT_CREDENTIAL_RULES, ALL).holders;
    const names = (filter: Parameters<typeof matchesPrintFilter>[1]) =>
      holders.filter((holder) => matchesPrintFilter(holder, filter)).map((holder) => holder.name);
    expect(names("pendientes")).toEqual(["Nueva"]);
    expect(names("impresas")).toEqual(["Impresa"]);
    expect(names("baja")).toEqual([]);
  });
});

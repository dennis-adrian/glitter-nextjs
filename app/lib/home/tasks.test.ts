import { describe, expect, it } from "vitest";

import {
  activityTasks,
  creditTasks,
  festivalTasks,
  formatTaskDue,
  orderTasks,
  profileTasks,
  sortHomeTasks,
  type HomeTask,
} from "@/app/lib/home/tasks";

const NOW = new Date("2026-11-01T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);

describe("festivalTasks", () => {
  it("keeps only open steps that have somewhere to go", () => {
    const tasks = festivalTasks([
      { key: "enrollment", label: "Inscripción", done: true, meta: "lista" },
      { key: "review", label: "Revisión del equipo", done: false, meta: "en curso" },
      { key: "products", label: "Subir imágenes de tus productos", done: false, href: "/p" },
    ]);

    expect(tasks.map((task) => task.key)).toEqual(["festival-products"]);
  });

  it("names the stand and carries the invoice deadline on the payment", () => {
    const [task] = festivalTasks(
      [{ key: "payment", label: "Pagar tu reserva", done: false, href: "/invoices" }],
      { standLabel: "stand B12", invoiceDueAt: hours(30) },
    );

    expect(task).toMatchObject({
      label: "Pagar tu reserva del stand B12",
      href: "/invoices",
      due: hours(30),
    });
  });

  it("leaves out what the team already has, like a payment under review", () => {
    expect(
      festivalTasks([
        { key: "payment", label: "Pago de la reserva", done: false, href: "/invoices", meta: "en revisión", waiting: true },
      ]),
    ).toEqual([]);
  });

  it("keeps the step's note, like the team count", () => {
    const [task] = festivalTasks([
      { key: "team", label: "Agregar a tu equipo", done: false, href: "/team", meta: "0 de 4" },
    ]);

    expect(task.note).toBe("0 de 4");
  });
});

describe("the other sources", () => {
  it("turns each pending order into a payment with its due date", () => {
    expect(orderTasks([{ id: 1042, paymentDueDate: hours(10) }])).toEqual([
      {
        key: "order-1042",
        label: "Pagar tu pedido #1042",
        href: "/orders/1042/payment",
        due: hours(10),
      },
    ]);
  });

  it("adds a credit task only for a debt, and marks it urgent", () => {
    expect(creditTasks(0)).toEqual([]);
    expect(creditTasks(60)[0]).toMatchObject({ href: "/my_credits", urgent: true });
  });

  it("names the activity and what it is missing", () => {
    const [task] = activityTasks(
      [
        {
          activityId: 7,
          activityName: "Pasaporte",
          pendingLabel: "Imagen del stand pendiente",
          deadline: hours(200),
        },
      ],
      "/my_participations/activities",
    );

    expect(task.label).toBe("Pasaporte: imagen del stand pendiente");
    expect(task.due).toEqual(hours(200));
  });

  it("lists the profile gaps own photo first, and the correction first of all when rejected", () => {
    const gaps = { photo: true, bio: true, socials: false, details: true };

    expect(profileTasks(gaps).map((task) => task.key)).toEqual([
      "profile-photo",
      "profile-bio",
      "profile-details",
    ]);
    expect(profileTasks(gaps, { rejected: true })[0].key).toBe("profile-fix");
    expect(
      profileTasks({ photo: false, bio: false, socials: false, details: false }),
    ).toEqual([]);
  });
});

describe("sortHomeTasks", () => {
  const task = (key: string, extra: Partial<HomeTask> = {}): HomeTask => ({
    key,
    label: key,
    href: "/",
    ...extra,
  });

  it("puts urgent and close deadlines first, then later deadlines, then the rest in order", () => {
    const sorted = sortHomeTasks(
      [
        task("plain-a"),
        task("later", { due: hours(100) }),
        task("debt", { urgent: true }),
        task("plain-b"),
        task("soon", { due: hours(5) }),
      ],
      NOW,
    );

    expect(sorted.map((entry) => entry.key)).toEqual([
      "soon",
      "debt",
      "later",
      "plain-a",
      "plain-b",
    ]);
  });
});

describe("formatTaskDue", () => {
  it("says until when, in Bolivia time with AM/PM", () => {
    // 22:00 UTC is 6:00 PM in La Paz.
    expect(formatTaskDue(new Date("2026-11-05T22:00:00Z"), NOW)).toBe(
      "hasta el 5 nov, 6:00 PM",
    );
  });

  it("says it is overdue once the deadline passed", () => {
    expect(formatTaskDue(hours(-1), NOW)).toBe("vencido");
  });
});

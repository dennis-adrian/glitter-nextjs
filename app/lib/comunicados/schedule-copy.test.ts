import { describe, expect, it } from "vitest";

import {
  audienceAtReleaseText,
  copyBannerText,
  overdueText,
  rescheduledToast,
  scheduleButtonLabel,
  scheduledForText,
  scheduledToast,
  scheduleLongLabel,
  scheduleMomentLabel,
} from "@/app/lib/comunicados/schedule-copy";

/** Saturday 31 October 2026, 9:00 in La Paz (UTC−4). */
const AT_ISO = "2026-10-31T13:00:00.000Z";
const AT = new Date(AT_ISO);

describe("the schedule's time", () => {
  it("reads in Bolivia time, as the rest of the dashboard writes it", () => {
    expect(scheduleMomentLabel(AT)).toBe("sáb, 31 oct, 9:00 AM");
    expect(scheduleLongLabel(AT)).toBe("sábado, 31 de octubre, 9:00 AM");
  });

  it("reads an ISO instant handed to a client component the same", () => {
    expect(scheduleMomentLabel(AT_ISO)).toBe("sáb, 31 oct, 9:00 AM");
    expect(scheduleLongLabel(AT_ISO)).toBe("sábado, 31 de octubre, 9:00 AM");
  });

  it("keeps La Paz's day when UTC has already turned to the next", () => {
    const lateEvening = new Date("2026-11-01T02:30:00.000Z");
    expect(scheduleMomentLabel(lateEvening)).toBe("sáb, 31 oct, 10:30 PM");
    expect(scheduleLongLabel(lateEvening)).toBe(
      "sábado, 31 de octubre, 10:30 PM",
    );
  });
});

describe("the schedule's sentences", () => {
  it("says when it goes out (E5)", () => {
    expect(scheduledForText(AT)).toBe(
      "Programado para el sábado, 31 de octubre, 9:00 AM (hora de Bolivia)",
    );
    expect(scheduledForText(AT_ISO)).toBe(scheduledForText(AT));
  });

  it("says it should have gone out (E6)", () => {
    expect(overdueText(AT)).toBe(
      "Debería haber salido el sáb, 31 oct, 9:00 AM y todavía no salió.",
    );
    expect(overdueText(AT_ISO)).toBe(overdueText(AT));
  });

  it("labels the dialog's button with the picked time (G5)", () => {
    expect(scheduleButtonLabel(AT)).toBe("Programar para sáb, 31 oct, 9:00 AM");
  });

  it("says the audience is counted at release, one person in the singular", () => {
    expect(audienceAtReleaseText(1240)).toBe(
      "La audiencia se calcula al momento del envío: hoy serían 1.240 personas.",
    );
    expect(audienceAtReleaseText(1)).toBe(
      "La audiencia se calcula al momento del envío: hoy sería 1 persona.",
    );
  });

  it("toasts a new time and a changed one", () => {
    expect(scheduledToast(AT)).toBe(
      "Quedó programado para el sáb, 31 oct, 9:00 AM.",
    );
    expect(rescheduledToast(AT)).toBe("Ahora sale el sáb, 31 oct, 9:00 AM.");
  });

  it("names the copied comunicado, or calls it untitled (G6)", () => {
    expect(copyBannerText("Cambio de horario de armado")).toBe(
      "Copia de «Cambio de horario de armado». Revisá los destinatarios antes de enviar.",
    );
    expect(copyBannerText("  ")).toBe(
      "Copia de «Sin título». Revisá los destinatarios antes de enviar.",
    );
  });
});

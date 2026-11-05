import { describe, expect, test } from "vitest";
import { commandStepEvent, detectPlantEvents, timestampMs } from "./events.ts";
import type { Station } from "./station.ts";
import { deblockedAt, stationAt } from "./testSupport.ts";

describe("detectPlantEvents", () => {
  test("sin cambios no hay eventos", () => {
    expect(detectPlantEvents(stationAt("coupled"), stationAt("coupled"), 1)).toEqual([]);
  });

  test("un cambio de potencia o de tensión no es un evento", () => {
    const after: Station = { ...deblockedAt(0), powerMW: 50, udcKV: 300 };
    expect(detectPlantEvents(deblockedAt(0), after, 1)).toEqual([]);
  });

  test("un equipo que empieza a maniobrar deja su evento y la estación pasa a transición", () => {
    const before = stationAt("stopped");
    const after: Station = {
      ...before,
      switchgear: { ...before.switchgear, Q1: { kind: "moving", to: "closed", remainingSeconds: 2 } },
    };
    expect(detectPlantEvents(before, after, 3)).toEqual([
      { code: "Q1.POS", state: "moving", timeSeconds: 3 },
      { code: "STATION.STATE", state: "transition", timeSeconds: 3 },
    ]);
  });

  test("al terminar la maniobra, el equipo queda en su posición y la estación en su estado", () => {
    const stopped = stationAt("stopped");
    const before: Station = {
      ...stopped,
      switchgear: { ...stopped.switchgear, Q1: { kind: "moving", to: "closed", remainingSeconds: 0.1 } },
    };
    expect(detectPlantEvents(before, stationAt("decoupled"), 5)).toEqual([
      { code: "Q1.POS", state: "closed", timeSeconds: 5 },
      { code: "STATION.STATE", state: "decoupled", timeSeconds: 5 },
    ]);
  });

  test("Q2 y QE tienen su propio código", () => {
    const qe = detectPlantEvents(stationAt("stopped"), stationAt("earthed"), 0);
    expect(qe.map((e) => e.code)).toEqual(["QE.POS", "STATION.STATE"]);
    const q2 = detectPlantEvents(stationAt("decoupled"), stationAt("coupled"), 0);
    expect(q2.map((e) => e.code)).toEqual(["Q2.POS", "STATION.STATE"]);
  });

  test("bloquear y desbloquear el convertidor son eventos", () => {
    const coupled = stationAt("coupled");
    expect(detectPlantEvents(coupled, { ...coupled, converter: "deblocked" }, 2)).toEqual([
      { code: "CONVERTER.BLOCK", state: "deblocked", timeSeconds: 2 },
    ]);
    expect(detectPlantEvents(deblockedAt(0), { ...deblockedAt(0), converter: "blocked" }, 2)).toEqual([
      { code: "CONVERTER.BLOCK", state: "blocked", timeSeconds: 2 },
    ]);
  });

  test("posiciones que no corresponden a ningún estado dan inconsistent", () => {
    const before = stationAt("coupled");
    const after: Station = {
      ...before,
      switchgear: { ...before.switchgear, Q1: { kind: "open" } },
    };
    expect(detectPlantEvents(before, after, 0)).toEqual([
      { code: "Q1.POS", state: "open", timeSeconds: 0 },
      { code: "STATION.STATE", state: "inconsistent", timeSeconds: 0 },
    ]);
  });
});

describe("commandStepEvent", () => {
  test("lleva el código de la orden, el paso y la hora", () => {
    expect(commandStepEvent({ code: "CMD.BLOCK" }, "selected", 4)).toEqual({
      code: "CMD.BLOCK",
      state: "selected",
      timeSeconds: 4,
    });
  });

  test("la consigna lleva su valor en MW", () => {
    expect(commandStepEvent({ code: "CMD.POWER_ORDER", valueMW: 300 }, "executed", 4)).toEqual({
      code: "CMD.POWER_ORDER",
      state: "executed",
      timeSeconds: 4,
      valueMW: 300,
    });
  });

  test("un valor que no es un número no se guarda", () => {
    const event = commandStepEvent({ code: "CMD.POWER_ORDER", valueMW: NaN }, "rejected", 4, "P inválida");
    expect(event).not.toHaveProperty("valueMW");
    expect(event.detail).toBe("P inválida");
  });

  test("el rechazo lleva su motivo", () => {
    const event = commandStepEvent({ code: "CMD.TO_COUPLED" }, "rejected", 1, "Q2 en maniobra");
    expect(event).toMatchObject({ state: "rejected", detail: "Q2 en maniobra" });
  });
});

describe("timestampMs", () => {
  test("es el instante de arranque más el tiempo simulado", () => {
    expect(timestampMs(1_000_000, 0)).toBe(1_000_000);
    expect(timestampMs(1_000_000, 2.5)).toBe(1_002_500);
  });

  test("el error de redondeo del tiempo acumulado no se arrastra", () => {
    expect(timestampMs(0, 0.1 + 0.1 + 0.1)).toBe(300);
  });
});

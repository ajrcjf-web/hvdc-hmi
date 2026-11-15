import { describe, expect, test } from "vitest";
import {
  evaluateProtections,
  noFaults,
  q1TripSeconds,
  type Faults,
  type ProtectionElement,
} from "./protections.ts";
import type { Station, StationConfig } from "./station.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

const withFaults = (station: Station, faults: Partial<Faults>): Station => ({
  ...station,
  faults: { ...noFaults(), ...faults },
});

const codes = (events: { code: string; state: string }[]) =>
  events.map((e) => `${e.code} ${e.state}`);

describe("q1TripSeconds: el disparo se expresa en ciclos de la red", () => {
  test("1,5 ciclos a 50 Hz son 30 ms", () => {
    expect(q1TripSeconds(testConfig)).toBeCloseTo(0.03, 10);
  });

  test("la frecuencia es un dato: a 60 Hz son 25 ms", () => {
    expect(q1TripSeconds({ ...testConfig, gridFrequencyHz: 60 })).toBeCloseTo(0.025, 10);
  });
});

describe("evaluateProtections: sin falla", () => {
  test("no cambia nada y devuelve la misma estación", () => {
    const station = deblockedAt(300);
    const result = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(result.station).toBe(station);
    expect(result.events).toEqual([]);
  });
});

describe("evaluateProtections: la protección actúa", () => {
  for (const [element, fault, code] of [
    ["transformerDifferential", "transformer", "PROT.TRANSFORMER_DIFFERENTIAL"],
    ["converterProtection", "converter", "PROT.CONVERTER"],
  ] as const) {
    test(`${element}: arranca, actúa, enclava el 86, bloquea el convertidor y dispara Q1`, () => {
      const station = withFaults(deblockedAt(300), { [fault]: true });
      const result = evaluateProtections(station, 0.1, testConfig, 0.1);

      expect(codes(result.events)).toEqual([
        `${code} picked-up`,
        `${code} operated`,
        "RELAY86.LOCKOUT locked",
        "CONVERTER.BLOCK blocked",
      ]);
      expect(result.events.every((e) => e.timeSeconds === 0.1)).toBe(true);
      expect(result.station.relay86).toEqual({ locked: true, operated: [element] });
      expect(result.station.switchgear.Q1).toMatchObject({ kind: "moving", to: "open" });
    });
  }

  test("el bloqueo es instantáneo: P, consigna y Udc a 0 sin rampa", () => {
    const station = withFaults(deblockedAt(300, 400), { converter: true });
    const { station: after } = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(after).toMatchObject({
      converter: "blocked",
      powerMW: 0,
      powerOrderMW: 0,
      udcKV: 0,
    });
  });

  test("el disparo no pasa por los enclavamientos del operador: abre con carga", () => {
    const station = withFaults(deblockedAt(300), { transformer: true });
    const { station: after } = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(after.switchgear.Q1).toEqual({
      kind: "moving",
      to: "open",
      remainingSeconds: q1TripSeconds(testConfig),
    });
  });

  test("Q2 y QE no se ven afectados", () => {
    const station = withFaults(deblockedAt(300), { transformer: true });
    const { station: after } = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(after.switchgear.Q2).toEqual({ kind: "closed" });
    expect(after.switchgear.QE).toEqual({ kind: "open" });
  });

  test("si el convertidor ya estaba bloqueado no hay evento de bloqueo", () => {
    const station = withFaults(stationAt("decoupled"), { transformer: true });
    const { events } = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(codes(events)).toEqual([
      "PROT.TRANSFORMER_DIFFERENTIAL picked-up",
      "PROT.TRANSFORMER_DIFFERENTIAL operated",
      "RELAY86.LOCKOUT locked",
    ]);
  });
});

describe("evaluateProtections: tiempo propio y retardo", () => {
  // Total 0.3 s = 0.2 s propio + 0.1 s intencional, con dt = 0.1 (no solo valores exactos).
  const slow: StationConfig = {
    ...testConfig,
    protectionSettings: {
      ...testConfig.protectionSettings,
      transformerDifferential: { operateTimeSeconds: 0.2, delaySeconds: 0.1 },
    },
  };

  function cyclesUntilOperated(config: StationConfig): number {
    let station = withFaults(stationAt("decoupled"), { transformer: true });
    for (let cycle = 1; cycle <= 20; cycle++) {
      const result = evaluateProtections(station, 0.1, config, cycle * 0.1);
      if (result.events.some((e) => e.state === "operated")) return cycle;
      station = result.station;
    }
    return -1;
  }

  test("actúa al cumplirse tiempo propio + retardo, ni antes ni después", () => {
    expect(cyclesUntilOperated(slow)).toBe(3);
  });

  test("el arranque se registra una sola vez, en el primer ciclo que ve la falla", () => {
    let station = withFaults(stationAt("decoupled"), { transformer: true });
    const all: string[] = [];
    for (let cycle = 1; cycle <= 2; cycle++) {
      const result = evaluateProtections(station, 0.1, slow, cycle * 0.1);
      all.push(...codes(result.events));
      station = result.station;
    }
    expect(all).toEqual(["PROT.TRANSFORMER_DIFFERENTIAL picked-up"]);
  });

  test("si deja de ver la falla antes de actuar, el contador vuelve a 0 y no actúa", () => {
    let station = withFaults(stationAt("decoupled"), { transformer: true });
    for (let cycle = 1; cycle <= 2; cycle++) {
      station = evaluateProtections(station, 0.1, slow, cycle * 0.1).station;
    }
    expect(station.protection.pickupSeconds.transformerDifferential).toBeCloseTo(0.2, 10);

    station = withFaults(station, { transformer: false });
    const cleared = evaluateProtections(station, 0.1, slow, 0.3);
    expect(cleared.station.protection.pickupSeconds.transformerDifferential).toBe(0);
    expect(cleared.station.relay86.locked).toBe(false);

    // Si vuelve, hay que esperar de nuevo el tiempo completo (y arranca de nuevo).
    const again = withFaults(cleared.station, { transformer: true });
    const first = evaluateProtections(again, 0.1, slow, 0.4);
    expect(codes(first.events)).toEqual(["PROT.TRANSFORMER_DIFFERENTIAL picked-up"]);
  });

  test("con el ajuste por defecto (30 ms) actúa en el primer ciclo de 100 ms", () => {
    expect(cyclesUntilOperated(testConfig)).toBe(1);
  });
});

describe("evaluateProtections: lo que se mide (cierre sobre falla)", () => {
  test("una falla en una zona sin energizar no la ve ningún relé", () => {
    // Q1 abierto: el transformador y el convertidor no están energizados.
    const station = withFaults(stationAt("stopped"), { transformer: true, converter: true });
    const result = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(result.station).toBe(station);
    expect(result.events).toEqual([]);
  });

  test("al energizarse la zona, la protección actúa", () => {
    const stopped = withFaults(stationAt("stopped"), { transformer: true });
    expect(evaluateProtections(stopped, 0.1, testConfig, 0.1).events).toEqual([]);

    // Q1 cierra (la zona se energiza): ahora la ve.
    const closed = { ...stopped, switchgear: stationAt("decoupled").switchgear };
    const result = evaluateProtections(closed, 0.1, testConfig, 0.2);
    expect(codes(result.events)).toContain("PROT.TRANSFORMER_DIFFERENTIAL operated");
    expect(result.station.relay86.locked).toBe(true);
  });

  test("Q1 que se está cerrando todavía no energiza la zona", () => {
    const closing: Station = {
      ...withFaults(stationAt("stopped"), { transformer: true }),
      switchgear: {
        ...stationAt("stopped").switchgear,
        Q1: { kind: "moving", to: "closed", remainingSeconds: 0.5 },
      },
    };
    expect(evaluateProtections(closing, 0.1, testConfig, 0.1).events).toEqual([]);
  });

  test("cada elemento ve solo su falla", () => {
    const station = withFaults(stationAt("decoupled"), { converter: true });
    const { station: after } = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(after.relay86.operated).toEqual(["converterProtection"]);
  });
});

describe("evaluateProtections: el 86 enclavado", () => {
  const locked = (operated: ProtectionElement[]): Station => ({
    ...stationAt("decoupled"),
    relay86: { locked: true, operated },
  });

  test("otro elemento que ve su falla también registra que actuó (sin repetir el 86)", () => {
    const station = withFaults(locked(["converterProtection"]), { transformer: true });
    const result = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(codes(result.events)).toEqual([
      "PROT.TRANSFORMER_DIFFERENTIAL picked-up",
      "PROT.TRANSFORMER_DIFFERENTIAL operated",
    ]);
    expect(result.station.relay86.operated).toEqual([
      "converterProtection",
      "transformerDifferential",
    ]);
  });

  test("un elemento que ya actuó no vuelve a actuar hasta el reset", () => {
    const station = withFaults(locked(["transformerDifferential"]), { transformer: true });
    const result = evaluateProtections(station, 0.1, testConfig, 0.1);
    expect(result.events).toEqual([]);
    expect(result.station.relay86.operated).toEqual(["transformerDifferential"]);
  });
});

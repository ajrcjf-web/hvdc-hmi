// La 21 (distancia, zonas 1 y 2) y la 27 (subtensión AC, dos escalones): qué ve cada una,
// cuándo actúa, el orden de los eventos y las alarmas.
import { describe, expect, test } from "vitest";
import type { AlarmState } from "./alarms.ts";
import type { SignalEvent } from "./events.ts";
import { measureAcVoltagePercent } from "./measurements.ts";
import {
  evaluateProtections,
  isCausePresent,
  isSeeing,
  isValidFault,
  noFaults,
  withFault,
  withoutFault,
  type Faults,
} from "./protections.ts";
import { runCycle } from "./simulationCycle.ts";
import { requestRelayReset, type Station, type StationConfig } from "./station.ts";
import { deblockedAt, noAlarms, stationAt, testConfig } from "./testSupport.ts";

const withFaults = (station: Station, faults: Partial<Faults>): Station => ({
  ...station,
  faults: { ...noFaults(), ...faults },
});
const lineFault = (percent: number) => ({ acLine: { locationPercent: percent } });
const voltageFault = (percent: number) => ({ acUndervoltage: { residualPercent: percent } });
const label = (e: { code: string; state: string }) => `${e.code} ${e.state}`;

// La 27 no ve la falla de línea si la residual es 100 %: permite probar la 21 sola.
const only21: StationConfig = { ...testConfig, acLineFaultResidualVoltagePercent: 100 };

// Encadena la etapa de protecciones (sin step) y junta los eventos de cada ciclo.
function stages(station: Station, cycles: number, config: StationConfig = testConfig) {
  let current = station;
  const perCycle: SignalEvent[][] = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const result = evaluateProtections(current, 0.1, config, cycle * 0.1);
    perCycle.push(result.events);
    current = result.station;
  }
  return { station: current, perCycle };
}

describe("tensión AC en TP1", () => {
  test("sin fallas es el 100 % de Un", () => {
    expect(measureAcVoltagePercent(stationAt("stopped"), testConfig)).toBe(100);
  });

  test("una falla de subtensión la deja en la residual que eligió el instructor", () => {
    expect(measureAcVoltagePercent(withFaults(stationAt("stopped"), voltageFault(65)), testConfig)).toBe(65);
  });

  test("una falla en la línea AC la deja en la residual fija de la configuración (0 %: franca)", () => {
    const station = withFaults(stationAt("stopped"), lineFault(50));
    expect(measureAcVoltagePercent(station, testConfig)).toBe(0);
    expect(measureAcVoltagePercent(station, { ...testConfig, acLineFaultResidualVoltagePercent: 40 })).toBe(40);
  });

  test("con las dos fallas vale la menor", () => {
    const station = withFaults(stationAt("stopped"), { ...lineFault(50), ...voltageFault(30) });
    expect(measureAcVoltagePercent(station, { ...testConfig, acLineFaultResidualVoltagePercent: 40 })).toBe(30);
    expect(measureAcVoltagePercent(station, { ...testConfig, acLineFaultResidualVoltagePercent: 10 })).toBe(10);
  });
});

describe("fallas con dato: validación y reemplazo", () => {
  test("la ubicación vale de 0 a 150 % y la residual de 0 a 100 %", () => {
    expect(isValidFault({ kind: "acLine", locationPercent: 150 })).toBe(true);
    expect(isValidFault({ kind: "acLine", locationPercent: 150.5 })).toBe(false);
    expect(isValidFault({ kind: "acLine", locationPercent: Number.NaN })).toBe(false);
    expect(isValidFault({ kind: "acUndervoltage", residualPercent: 100 })).toBe(true);
    expect(isValidFault({ kind: "acUndervoltage", residualPercent: -1 })).toBe(false);
  });

  test("un valor que no vale no provoca la falla y deja las mismas fallas", () => {
    const faults = noFaults();
    expect(withFault(faults, { kind: "acLine", locationPercent: 200 })).toBe(faults);
  });

  test("los mismos datos no cambian nada; otros datos reemplazan los anteriores", () => {
    const faults = withFault(noFaults(), { kind: "acLine", locationPercent: 50 });
    expect(faults.acLine).toEqual({ locationPercent: 50 });
    expect(withFault(faults, { kind: "acLine", locationPercent: 50 })).toBe(faults);
    expect(withFault(faults, { kind: "acLine", locationPercent: 90 }).acLine).toEqual({ locationPercent: 90 });
  });

  test("despejar deja la falla en null (o false) y despejar una que no está no cambia nada", () => {
    const faults = withFault(noFaults(), { kind: "acUndervoltage", residualPercent: 50 });
    expect(withoutFault(faults, "acUndervoltage").acUndervoltage).toBeNull();
    expect(withoutFault(noFaults(), "acLine")).toEqual(noFaults());
  });
});

describe("21: qué ve, según la ubicación y lo que aporta la estación", () => {
  const seen = (station: Station, config = testConfig) =>
    (["distanceZone1", "distanceZone2"] as const).filter((e) => isSeeing(e, station, config));

  test("al 50 % la ven las dos zonas; al 80 %, también (hasta el alcance incluido)", () => {
    expect(seen(withFaults(deblockedAt(300), lineFault(50)))).toEqual(["distanceZone1", "distanceZone2"]);
    expect(seen(withFaults(deblockedAt(300), lineFault(80)))).toEqual(["distanceZone1", "distanceZone2"]);
  });

  test("entre el 80 y el 120 % solo la zona 2", () => {
    expect(seen(withFaults(deblockedAt(300), lineFault(80.1)))).toEqual(["distanceZone2"]);
    expect(seen(withFaults(deblockedAt(300), lineFault(100)))).toEqual(["distanceZone2"]);
    expect(seen(withFaults(deblockedAt(300), lineFault(120)))).toEqual(["distanceZone2"]);
  });

  test("más allá del 120 % no la ve ninguna zona", () => {
    expect(seen(withFaults(deblockedAt(300), lineFault(120.1)))).toEqual([]);
    expect(seen(withFaults(deblockedAt(300), lineFault(150)))).toEqual([]);
  });

  test("con Q1 abierto no hay corriente por CT1: no la ve", () => {
    expect(seen(withFaults(stationAt("stopped"), lineFault(50)))).toEqual([]);
  });

  test("con el convertidor bloqueado (aunque Q1 esté cerrado) no hay corriente por CT1: no la ve", () => {
    expect(seen(withFaults(stationAt("decoupled"), lineFault(50)))).toEqual([]);
    // La causa sigue presente: lo que falta es la corriente.
    expect(isCausePresent("distanceZone1", withFaults(stationAt("decoupled"), lineFault(50)), testConfig)).toBe(true);
  });

  test("un Q1 que se está cerrando todavía no aporta corriente", () => {
    const station: Station = {
      ...withFaults(deblockedAt(300), lineFault(50)),
      switchgear: { ...deblockedAt(300).switchgear, Q1: { kind: "moving", to: "closed", remainingSeconds: 1 } },
    };
    expect(seen(station)).toEqual([]);
  });

  test("un Q1 que se está abriendo (disparo) sigue aportando hasta que termina de abrir", () => {
    const station: Station = {
      ...withFaults(deblockedAt(300), lineFault(50)),
      switchgear: { ...deblockedAt(300).switchgear, Q1: { kind: "moving", to: "open", remainingSeconds: 0.03 } },
    };
    expect(seen(station)).toEqual(["distanceZone1", "distanceZone2"]);
  });
});

describe("21: cuándo actúa", () => {
  test("la zona 1 es instantánea (30 ms de tiempo propio): actúa en el primer ciclo de 100 ms", () => {
    const { perCycle, station } = stages(withFaults(deblockedAt(300), lineFault(50)), 1, only21);
    expect(perCycle[0]!.map(label)).toEqual([
      "PROT.DISTANCE_Z1 picked-up",
      "PROT.DISTANCE_Z2 picked-up",
      "PROT.DISTANCE_Z1 operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
    ]);
    expect(station.relay86.operated).toEqual(["distanceZone1"]);
  });

  test("la zona 2 espera 300 ms: no actúa a los 200 ms y sí a los 300 (dt = 0.1)", () => {
    // Al 100 % solo la ve la zona 2; con la residual en 100 % la 27 no interviene.
    const { perCycle } = stages(withFaults(deblockedAt(300), lineFault(100)), 4, only21);
    expect(perCycle[0]!.map(label)).toEqual(["PROT.DISTANCE_Z2 picked-up"]);
    expect(perCycle[1]).toEqual([]);
    expect(perCycle[2]!.map(label)).toEqual([
      "PROT.DISTANCE_Z2 operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
    ]);
  });

  test("si la falla se despeja antes de los 300 ms, la zona 2 no actúa y el contador vuelve a 0", () => {
    let { station } = stages(withFaults(deblockedAt(300), lineFault(100)), 2, only21);
    expect(station.protection.pickupSeconds.distanceZone2).toBeCloseTo(0.2, 10);
    station = { ...station, faults: noFaults() };
    const result = evaluateProtections(station, 0.1, only21, 0.3);
    expect(result.station.protection.pickupSeconds.distanceZone2).toBe(0);
    expect(result.station.relay86.locked).toBe(false);
  });

  test("más allá del 120 %, la 21 no arranca (y la 27 sí actúa, por la residual de la línea)", () => {
    const { perCycle } = stages(withFaults(deblockedAt(300), lineFault(130)), 1);
    const labels = perCycle[0]!.map(label);
    expect(labels.filter((l) => l.startsWith("PROT.DISTANCE"))).toEqual([]);
    expect(labels).toContain("PROT.UNDERVOLTAGE_S2 operated");
  });
});

describe("27: escalones por tensión residual", () => {
  const atResidual = (percent: number, cycles = 1) =>
    stages(withFaults(deblockedAt(300), voltageFault(percent)), cycles);

  test("con la tensión en el arranque o por encima no hay arranque (actúa por debajo)", () => {
    expect(atResidual(80).perCycle[0]).toEqual([]);
    expect(atResidual(100).perCycle[0]).toEqual([]);
  });

  test("entre el 70 y el 80 % solo el escalón 1, que espera 300 ms", () => {
    const { perCycle } = atResidual(75, 3);
    expect(perCycle[0]!.map(label)).toEqual(["PROT.UNDERVOLTAGE_S1 picked-up"]);
    expect(perCycle[1]).toEqual([]);
    expect(perCycle[2]!.map(label)).toEqual([
      "PROT.UNDERVOLTAGE_S1 operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
    ]);
  });

  test("en el 70 % justo, el escalón 2 no arranca (por debajo del 70 %) pero el 1 sí", () => {
    expect(atResidual(70).perCycle[0]!.map(label)).toEqual(["PROT.UNDERVOLTAGE_S1 picked-up"]);
  });

  test("por debajo del 70 % el escalón 2 actúa al instante y el 1 arranca", () => {
    const { perCycle, station } = atResidual(65);
    expect(perCycle[0]!.map(label)).toEqual([
      "PROT.UNDERVOLTAGE_S1 picked-up",
      "PROT.UNDERVOLTAGE_S2 picked-up",
      "PROT.UNDERVOLTAGE_S2 operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
    ]);
    expect(station.relay86.operated).toEqual(["acUndervoltageStage2"]);
  });

  test("el escalón 1 actúa después del 2: la 27 sigue viendo la tensión baja mientras haya falla", () => {
    const { perCycle, station } = atResidual(65, 3);
    // El 86 ya estaba enclavado: solo se registra el disparo del escalón 1 (sin repetir el 86).
    expect(perCycle[1]).toEqual([]);
    expect(perCycle[2]!.map(label)).toEqual(["PROT.UNDERVOLTAGE_S1 operated"]);
    expect(station.relay86.operated).toEqual(["acUndervoltageStage2", "acUndervoltageStage1"]);
  });

  test("la 27 ve la falla siempre: con la estación parada, el 86 se enclava sin nada que disparar", () => {
    const { station, perCycle } = stages(withFaults(stationAt("stopped"), voltageFault(50)), 1);
    expect(perCycle[0]!.map(label)).toContain("PROT.UNDERVOLTAGE_S2 operated");
    expect(station.relay86.locked).toBe(true);
    expect(station.switchgear.Q1).toEqual({ kind: "open" });
  });
});

describe("21 y 27 con la falla de línea AC en el ciclo completo", () => {
  type Run = { station: Station; alarms: AlarmState; events: SignalEvent[] };
  function run(station: Station, cycles: number, config: StationConfig = testConfig): Run {
    let current = station;
    let alarms = noAlarms;
    const events: SignalEvent[] = [];
    for (let i = 0; i < cycles; i++) {
      const cycle = runCycle(current, i * 0.1, [], 0.1, config, alarms);
      current = cycle.station;
      alarms = cycle.alarms;
      for (const e of cycle.events) if (e.kind === "signal") events.push(e.event);
    }
    return { station: current, alarms, events };
  }

  test("falla franca al 50 % desde coupled con carga: eventos en orden causal, en un solo ciclo", () => {
    const { events, station } = run(withFaults(deblockedAt(300), lineFault(50)), 1);
    expect(events.map(label)).toEqual([
      "PROT.DISTANCE_Z1 picked-up",
      "PROT.DISTANCE_Z2 picked-up",
      "PROT.UNDERVOLTAGE_S1 picked-up",
      "PROT.UNDERVOLTAGE_S2 picked-up",
      "PROT.DISTANCE_Z1 operated",
      "PROT.UNDERVOLTAGE_S2 operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
      "Q1.POS open",
      "STATION.STATE inconsistent",
      "ALARM.PROT_DISTANCE active-unacknowledged",
      "ALARM.PROT_UNDERVOLTAGE active-unacknowledged",
      "ALARM.RELAY86_LOCKED active-unacknowledged",
      "ALARM.INCONSISTENT active-unacknowledged",
    ]);
    expect(station).toMatchObject({ converter: "blocked", powerMW: 0, udcKV: 0 });
    expect(station.relay86.operated).toEqual(["distanceZone1", "acUndervoltageStage2"]);
  });

  test("al disparar el más rápido, la 21 deja de ver la falla: la zona 2 arrancó pero no actúa", () => {
    const { events, station } = run(withFaults(deblockedAt(300), lineFault(50)), 10);
    const z2 = events.filter((e) => e.code === "PROT.DISTANCE_Z2").map((e) => e.state);
    expect(z2).toEqual(["picked-up"]); // sin Q1 ni convertidor no hay corriente por CT1
    expect(station.protection.pickupSeconds.distanceZone2).toBe(0);
  });

  test("la 27 escalón 1 también termina actuando, a los 300 ms (TP1 sigue viendo la tensión baja)", () => {
    const { events } = run(withFaults(deblockedAt(300), lineFault(50)), 5);
    const s1 = events.find((e) => label(e) === "PROT.UNDERVOLTAGE_S1 operated");
    expect(s1?.timeSeconds).toBeCloseTo(0.3, 10);
  });

  test("al despejar la falla se normalizan las alarmas de las dos protecciones; la del 86 sigue", () => {
    let { station, alarms } = run(withFaults(deblockedAt(300), lineFault(50)), 4);
    station = { ...station, faults: noFaults() };
    const cycle = runCycle(station, 0.4, [], 0.1, testConfig, alarms);
    alarms = cycle.alarms;
    expect(alarms.life["ALARM.PROT_DISTANCE"]).toBe("returned-unacknowledged");
    expect(alarms.life["ALARM.PROT_UNDERVOLTAGE"]).toBe("returned-unacknowledged");
    expect(alarms.life["ALARM.RELAY86_LOCKED"]).toBe("active-unacknowledged");
  });

  test("falla de línea AC con la estación parada: actúa la 27 (no la 21), sin disparo ni inconsistencia", () => {
    const { events, station, alarms } = run(withFaults(stationAt("stopped"), lineFault(50)), 1);
    const labels = events.map(label);
    expect(labels.filter((l) => l.startsWith("PROT.DISTANCE"))).toEqual([]);
    expect(labels).toContain("PROT.UNDERVOLTAGE_S2 operated");
    expect(station.relay86.locked).toBe(true);
    expect(alarms.life["ALARM.PROT_UNDERVOLTAGE"]).toBe("active-unacknowledged");
    expect(alarms.life["ALARM.PROT_DISTANCE"]).toBe("normal");
    expect(alarms.life["ALARM.INCONSISTENT"]).toBe("normal");
  });
});

describe("reset del 86 con las causas de la 21 y de la 27", () => {
  test("se rechaza mientras la falla siga presente y nombra las protecciones que actuaron", () => {
    const { station } = stages(withFaults(deblockedAt(300), lineFault(50)), 1);
    const result = requestRelayReset(station, testConfig);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("Protección de distancia (21), zona 1"),
    });
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("Protección de subtensión AC (27), escalón 2"),
    });
  });

  test("con la falla despejada se acepta", () => {
    const { station } = stages(withFaults(deblockedAt(300), lineFault(50)), 1);
    const cleared = { ...station, faults: noFaults() };
    expect(requestRelayReset(cleared, testConfig)).toMatchObject({ ok: true });
  });

  test("si el instructor mueve la falla más allá de lo que vio la zona 1, esa causa se despejó", () => {
    const { station } = stages(withFaults(deblockedAt(300), lineFault(50)), 1, only21);
    const moved = { ...station, faults: { ...noFaults(), ...lineFault(100) } };
    expect(isCausePresent("distanceZone1", moved, only21)).toBe(false);
    expect(requestRelayReset(moved, only21)).toMatchObject({ ok: true });
  });
});

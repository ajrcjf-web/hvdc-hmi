// Las protecciones dentro del ciclo de simulación: orden causal de los eventos, el disparo
// de Q1 dentro del ciclo, las alarmas y el cierre sobre falla de punta a punta.
import { describe, expect, test } from "vitest";
import type { AlarmState } from "./alarms.ts";
import type { SignalEvent } from "./events.ts";
import { noFaults, type Faults } from "./protections.ts";
import { runCycle } from "./simulationCycle.ts";
import {
  advance,
  clearFault,
  createSimulationState,
  setFault,
} from "./simulationState.ts";
import { requestSwitchOrder, type Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { deblockedAt, noAlarms, stationAt, testConfig } from "./testSupport.ts";

const withFaults = (station: Station, faults: Partial<Faults>): Station => ({
  ...station,
  faults: { ...noFaults(), ...faults },
});

type Run = { station: Station; alarms: AlarmState; events: SignalEvent[]; timeSeconds: number };

// Corre ciclos de dt hasta cubrir `seconds`, juntando los eventos de señal.
function run(station: Station, seconds: number, dt: number): Run {
  let current = station;
  let alarms = noAlarms;
  let time = 0;
  const events: SignalEvent[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const cycle = runCycle(current, time, [], dt, testConfig, alarms);
    current = cycle.station;
    alarms = cycle.alarms;
    time = cycle.timeSeconds;
    for (const e of cycle.events) if (e.kind === "signal") events.push(e.event);
  }
  return { station: current, alarms, events, timeSeconds: time };
}

const label = (e: SignalEvent) => `${e.code} ${e.state}`;

describe("runCycle: una falla con la estación en coupled y con carga", () => {
  const faulty = withFaults(deblockedAt(300), { converter: true });

  test("los eventos salen en orden causal, todos en el mismo ciclo (dt = 0.1)", () => {
    const { events } = run(faulty, 0.1, 0.1);
    expect(events.map(label)).toEqual([
      "PROT.CONVERTER picked-up",
      "PROT.CONVERTER operated",
      "RELAY86.LOCKOUT locked",
      "CONVERTER.BLOCK blocked",
      "Q1.POS open",
      "STATION.STATE inconsistent",
      "ALARM.PROT_CONVERTER active-unacknowledged",
      "ALARM.RELAY86_LOCKED active-unacknowledged",
      "ALARM.INCONSISTENT active-unacknowledged",
    ]);
    expect(events.every((e) => e.timeSeconds === 0.1)).toBe(true);
  });

  test("al terminar el ciclo: Q1 abierto, Q2 cerrado (inconsistent), convertidor bloqueado y P = Udc = 0", () => {
    const { station } = run(faulty, 0.1, 0.1);
    expect(station.switchgear.Q1).toEqual({ kind: "open" });
    expect(station.switchgear.Q2).toEqual({ kind: "closed" });
    expect(deriveState(station.switchgear)).toBe("inconsistent");
    expect(station).toMatchObject({ converter: "blocked", powerMW: 0, powerOrderMW: 0, udcKV: 0 });
    expect(station.relay86.locked).toBe(true);
  });

  test("con dt = 0.01 el disparo de 30 ms dura tres ciclos y Q1 se ve en maniobra", () => {
    const { events } = run(faulty, 0.2, 0.01);
    const q1 = events.filter((e) => e.code === "Q1.POS");
    expect(q1.map((e) => e.state)).toEqual(["moving", "open"]);
    const operated = events.find((e) => e.state === "operated");
    expect(operated?.timeSeconds).toBeCloseTo(0.03, 10);
    // El ciclo en que se ordena el disparo ya descuenta su dt (la etapa de protecciones va
    // antes de step), así que Q1 abre en el tercer ciclo contando ése: 0.03 + 2 × 0.01.
    // Es la resolución del ciclo: el error es a lo sumo un dt (simplificación conocida).
    expect(q1[1]!.timeSeconds).toBeCloseTo(0.05, 10);
    // La alarma de inconsistencia espera a que Q1 termine de abrir.
    const inconsistent = events.find((e) => e.code === "ALARM.INCONSISTENT");
    expect(inconsistent?.timeSeconds).toBeCloseTo(0.05, 10);
  });

  test("el bloqueo del convertidor se registra una sola vez", () => {
    const { events } = run(faulty, 1, 0.1);
    expect(events.filter((e) => e.code === "CONVERTER.BLOCK")).toHaveLength(1);
  });

  test("Q2 y QE no se ven afectados: una maniobra de Q2 en curso sigue y termina", () => {
    const closingQ2: Station = {
      ...withFaults(stationAt("decoupled"), { transformer: true }),
      switchgear: {
        ...stationAt("decoupled").switchgear,
        Q2: { kind: "moving", to: "closed", remainingSeconds: 1 },
      },
    };
    const { station } = run(closingQ2, 2, 0.1);
    expect(station.switchgear.Q1).toEqual({ kind: "open" });
    expect(station.switchgear.Q2).toEqual({ kind: "closed" });
    expect(deriveState(station.switchgear)).toBe("inconsistent");
  });
});

describe("runCycle: una falla con la estación en decoupled", () => {
  test("queda en stopped (un estado válido), con el 86 enclavado y sin alarma de inconsistencia", () => {
    const { station, alarms } = run(withFaults(stationAt("decoupled"), { transformer: true }), 1, 0.1);
    expect(deriveState(station.switchgear)).toBe("stopped");
    expect(station.relay86.locked).toBe(true);
    expect(alarms.life["ALARM.PROT_TRANSFORMER_DIFFERENTIAL"]).toBe("active-unacknowledged");
    expect(alarms.life["ALARM.RELAY86_LOCKED"]).toBe("active-unacknowledged");
    expect(alarms.life["ALARM.INCONSISTENT"]).toBe("normal");
  });
});

describe("runCycle: cierre sobre falla", () => {
  test("con Q1 abierto nadie ve la falla; al cerrar Q1 actúa la 87T y Q1 vuelve a abrir", () => {
    const stopped: Station = {
      ...withFaults(stationAt("stopped"), { transformer: true }),
      mode: "manual",
    };
    const order = requestSwitchOrder(stopped, "Q1", "closed", testConfig);
    if (!order.ok) throw new Error(order.reason);

    const { events, station } = run(order.station, 5, 0.1);
    const labels = events.map(label);

    // Primero Q1 cierra; solo después arranca y actúa la protección.
    const closed = labels.indexOf("Q1.POS closed");
    const pickedUp = labels.indexOf("PROT.TRANSFORMER_DIFFERENTIAL picked-up");
    expect(closed).toBeGreaterThanOrEqual(0);
    expect(pickedUp).toBeGreaterThan(closed);
    expect(labels).toContain("PROT.TRANSFORMER_DIFFERENTIAL operated");
    expect(labels).toContain("RELAY86.LOCKOUT locked");
    expect(labels.slice(pickedUp, pickedUp + 4)).toEqual([
      "PROT.TRANSFORMER_DIFFERENTIAL picked-up",
      "PROT.TRANSFORMER_DIFFERENTIAL operated",
      "RELAY86.LOCKOUT locked",
      "Q1.POS open",
    ]);
    expect(station.switchgear.Q1).toEqual({ kind: "open" });
  });

  test("con la falla presente y el 86 enclavado, el operador no puede volver a cerrar Q1", () => {
    const stopped: Station = {
      ...withFaults(stationAt("stopped"), { transformer: true }),
      mode: "manual",
      relay86: { locked: true, operated: ["transformerDifferential"] },
    };
    const order = requestSwitchOrder(stopped, "Q1", "closed", testConfig);
    expect(order).toEqual({ ok: false, reason: expect.stringContaining("relé 86 enclavado") });
  });
});

describe("estado de la simulación: el instructor provoca y despeja", () => {
  const coupled = () => {
    const state = createSimulationState(testConfig, 0);
    return { ...state, station: deblockedAt(300) };
  };

  test("setFault y clearFault cambian solo la causa y no hacen nada si no cambia", () => {
    const state = coupled();
    const faulty = setFault(state, { kind: "converter" });
    expect(faulty.station.faults.converter).toBe(true);
    expect(faulty.station.relay86.locked).toBe(false);
    expect(setFault(faulty, { kind: "converter" })).toBe(faulty);
    expect(clearFault(faulty, "converter").station.faults.converter).toBe(false);
    expect(clearFault(state, "converter")).toBe(state);
  });

  test("la falla llega al SER y a las alarmas", () => {
    const state = advance(setFault(coupled(), { kind: "converter" }), 0.1).state;
    expect(state.station.relay86.locked).toBe(true);
    expect(state.alarms.life["ALARM.PROT_CONVERTER"]).toBe("active-unacknowledged");
    expect(state.alarms.life["ALARM.RELAY86_LOCKED"]).toBe("active-unacknowledged");
    // El SER guarda el más reciente primero: la última es la alarma de inconsistencia.
    expect(state.events[0]).toMatchObject({ code: "ALARM.INCONSISTENT" });
    expect(state.events.map((e) => e.code)).toContain("PROT.CONVERTER");
  });
});

describe("alarmas de protección y del 86", () => {
  const tripped = () =>
    advance(setFault({ ...createSimulationState(testConfig, 0), station: deblockedAt(300) }, { kind: "converter" }), 0.1)
      .state;

  test("al despejar la falla, la alarma de la protección se normaliza y la del 86 sigue activa", () => {
    const state = advance(clearFault(tripped(), "converter"), 0.1).state;
    // El 86 no se suelta solo: sigue enclavado, y con él su alarma. Que la de la protección
    // se normalice es la señal, en la lista de alarmas, de que ya se puede resetear.
    expect(state.station.relay86.locked).toBe(true);
    expect(state.alarms.life["ALARM.PROT_CONVERTER"]).toBe("returned-unacknowledged");
    expect(state.alarms.life["ALARM.RELAY86_LOCKED"]).toBe("active-unacknowledged");
    const last = state.events.slice(0, 1);
    expect(last).toMatchObject([{ code: "ALARM.PROT_CONVERTER", state: "returned-unacknowledged" }]);
  });

  test("la alarma del 86 dura hasta que el 86 se resetea", () => {
    let state = advance(clearFault(tripped(), "converter"), 0.1).state;
    // El reset es una orden del operador (otro PR): aquí se suelta el relé a mano.
    state = { ...state, station: { ...state.station, relay86: { locked: false, operated: [] } } };
    state = advance(state, 0.1).state;
    expect(state.alarms.life["ALARM.RELAY86_LOCKED"]).toBe("returned-unacknowledged");
  });

  test("si la falla reaparece con la protección ya actuada, su alarma vuelve a activarse", () => {
    let state = advance(clearFault(tripped(), "converter"), 0.1).state;
    expect(state.alarms.life["ALARM.PROT_CONVERTER"]).toBe("returned-unacknowledged");
    state = advance(setFault(state, { kind: "converter" }), 0.1).state;
    expect(state.alarms.life["ALARM.PROT_CONVERTER"]).toBe("active-unacknowledged");
  });

  test("despejar la falla antes de que el elemento actúe no genera ninguna alarma", () => {
    const stopped = { ...createSimulationState(testConfig, 0), station: stationAt("stopped") };
    const state = advance(setFault(stopped, { kind: "converter" }), 0.1).state;
    expect(state.alarms.life["ALARM.PROT_CONVERTER"]).toBe("normal");
    expect(state.alarms.life["ALARM.RELAY86_LOCKED"]).toBe("normal");
  });
});

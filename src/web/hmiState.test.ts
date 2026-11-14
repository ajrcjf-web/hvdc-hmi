import { describe, expect, test } from "vitest";
import type { AlarmCode, TestAlarmCode } from "../alarms.ts";
import type { Station } from "../station.ts";
import { deriveState } from "../stationState.ts";
import { MAX_EVENTS } from "../simulationState.ts";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import {
  blockCommand,
  deblockCommand,
  powerOrderCommand,
  transitionCommand,
  type OperatorCommand,
} from "./commands.ts";
import {
  createHmiState,
  DEFAULT_SELECTION_TIMEOUT_SECONDS,
  DT_SECONDS,
  hmiReducer,
  type HmiAction,
  type HmiState,
} from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };
const execute: HmiAction = { type: "execute" };
const cancel: HmiAction = { type: "cancel" };
const select = (command: OperatorCommand): HmiAction => ({ type: "select", command });

function run(state: HmiState, ...actions: HmiAction[]): HmiState {
  return actions.reduce(hmiReducer, state);
}

function ticks(state: HmiState, count: number): HmiState {
  return run(state, ...Array.from({ length: count }, () => tick));
}

const initial = () => createHmiState(testConfig);

// Un estado con la estación indicada (para partir de una situación concreta).
const withStation = (station: Station): HmiState => {
  const state = initial();
  return { ...state, simulation: { ...state.simulation, station } };
};

// Los estados de una señal de orden, en orden cronológico (el SER guarda el más reciente primero).
const cmdStates = (state: HmiState, code: string) =>
  [...state.simulation.events]
    .reverse()
    .filter((event) => event.code === code)
    .map((event) => event.state);
// El motivo (detail) del rechazo más reciente de una señal.
const rejectionOf = (state: HmiState, code: string) =>
  state.simulation.events.find((event) => event.code === code && event.state === "rejected")?.detail;

describe("hmiReducer: reloj", () => {
  test("un latido avanza el tiempo dt", () => {
    expect(run(initial(), tick).simulation.timeSeconds).toBe(DT_SECONDS);
  });

  test("el tiempo se acumula (con redondeo decimal)", () => {
    expect(ticks(initial(), 10).simulation.timeSeconds).toBeCloseTo(1, 9);
  });
});

describe("hmiReducer: seleccionar", () => {
  test("una orden válida abre la selección y se registra", () => {
    const state = run(initial(), select(transitionCommand("decoupled")));
    expect(state.ui.selection).toMatchObject({
      command: { kind: "transition", to: "decoupled" },
      selectedAtSeconds: 0,
      expiresAtSeconds: DEFAULT_SELECTION_TIMEOUT_SECONDS,
    });
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected"]);
  });

  test("seleccionar no cambia la estación ni deja órdenes pendientes", () => {
    const before = initial();
    const state = run(before, select(transitionCommand("decoupled")));
    expect(state.simulation.station).toEqual(before.simulation.station);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
    expect(state.simulation.pending).toEqual([]);
  });

  test("una orden que sería rechazada no abre la selección y explica por qué", () => {
    const state = run(initial(), select(transitionCommand("coupled")));
    expect(state.ui.selection).toBeNull();
    expect(cmdStates(state, "CMD.TO_COUPLED")).toEqual(["rejected"]);
    expect(rejectionOf(state, "CMD.TO_COUPLED")).toContain("Transición no permitida");
  });

  test("la verificación usa los enclavamientos de la estación (consigna sin convertidor)", () => {
    const state = run(initial(), select(powerOrderCommand(300)));
    expect(state.ui.selection).toBeNull();
    expect(rejectionOf(state, "CMD.POWER_ORDER")).toContain("coupled");
  });

  test("una consigna que no es un número no se puede seleccionar", () => {
    const state = run(withStation(deblockedAt()), select(powerOrderCommand(Number.NaN)));
    expect(state.ui.selection).toBeNull();
    expect(cmdStates(state, "CMD.POWER_ORDER")).toEqual(["rejected"]);
    // Un valor que no es número no se guarda como dato del evento.
    expect(state.simulation.events[0]?.valueMW).toBeUndefined();
  });

  test("una consigna válida se puede seleccionar", () => {
    const state = run(withStation(deblockedAt()), select(powerOrderCommand(300)));
    expect(state.ui.selection?.command).toEqual({ kind: "powerOrder", orderMW: 300 });
  });

  test("solo hay una selección a la vez: la segunda se rechaza", () => {
    const state = run(
      initial(),
      select(transitionCommand("decoupled")),
      select(transitionCommand("earthed")),
    );
    expect(state.ui.selection?.command).toEqual({ kind: "transition", to: "decoupled" });
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected"]);
    expect(cmdStates(state, "CMD.TO_EARTHED")).toEqual(["rejected"]);
    expect(rejectionOf(state, "CMD.TO_EARTHED")).toContain("selección activa");
  });

  test("la respuesta más reciente reemplaza a la anterior: tras un rechazo, una selección válida", () => {
    const state = run(
      initial(),
      select(transitionCommand("coupled")),
      select(transitionCommand("decoupled")),
    );
    // El SER guarda el más reciente primero.
    expect(state.simulation.events.map((event) => event.state).slice(0, 2)).toEqual([
      "selected",
      "rejected",
    ]);
  });
});

describe("hmiReducer: seleccionar durante una maniobra", () => {
  test("el aviso y el registro indican qué equipo se mueve", () => {
    // Ir a decoupled deja a Q1 cerrándose; mientras tanto no se acepta otra orden de estado.
    const moving = run(initial(), select(transitionCommand("decoupled")), execute, tick);
    const state = run(moving, select(transitionCommand("stopped")));
    expect(state.ui.selection).toBeNull();
    expect(cmdStates(state, "CMD.TO_STOPPED")).toEqual(["rejected"]);
    expect(rejectionOf(state, "CMD.TO_STOPPED")).toContain("Q1 en maniobra (cierre)");
  });
});

describe("hmiReducer: ejecutar", () => {
  test("la orden queda pendiente y la selección se cierra, sin cambiar aún la estación", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), execute);
    expect(state.ui.selection).toBeNull();
    expect(state.simulation.pending).toHaveLength(1);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
    // "Ejecutar" no es un evento: la orden aparece como ejecutada en el latido siguiente.
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected"]);
  });

  test("el latido siguiente la ejecuta y la registra", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), execute, tick);
    expect(state.simulation.pending).toEqual([]);
    expect(deriveState(state.simulation.station.switchgear)).toBe("transition");
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "executed"]);
  });

  test("también se ejecuta con el tiempo ya con redondeo decimal", () => {
    // Después de 3 latidos el tiempo es 0.30000000000000004, no 0.3.
    const state = run(ticks(initial(), 3), select(transitionCommand("decoupled")), execute, tick);
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "executed"]);
  });

  test("una orden confirmada puede rechazarse al ejecutar si la estación cambió", () => {
    const selected = run(withStation(deblockedAt()), select(powerOrderCommand(300)));
    expect(selected.ui.selection).not.toBeNull();

    // Entre seleccionar y ejecutar, la tensión se cae.
    const changed: HmiState = {
      ...selected,
      simulation: { ...selected.simulation, station: { ...selected.simulation.station, udcKV: 0 } },
    };
    const state = run(changed, execute, tick);

    expect(cmdStates(state, "CMD.POWER_ORDER")).toEqual(["selected", "rejected"]);
    expect(rejectionOf(state, "CMD.POWER_ORDER")).toContain("Udc");
    expect(state.simulation.station.powerOrderMW).toBe(0);
  });

  test("sin selección no hace nada", () => {
    const state = initial();
    expect(run(state, execute)).toBe(state);
  });
});

describe("hmiReducer: cancelar", () => {
  test("cierra la selección, la registra y no ejecuta nada", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), cancel, tick);
    expect(state.ui.selection).toBeNull();
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "cancelled"]);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
  });

  test("después de cancelar se puede seleccionar otra orden", () => {
    const state = run(
      initial(),
      select(transitionCommand("decoupled")),
      cancel,
      select(transitionCommand("earthed")),
    );
    expect(state.ui.selection?.command).toEqual({ kind: "transition", to: "earthed" });
  });

  test("sin selección no hace nada", () => {
    const state = initial();
    expect(run(state, cancel)).toBe(state);
  });
});

describe("hmiReducer: expiración (tiempo simulado)", () => {
  test("no expira antes del plazo", () => {
    const state = ticks(run(initial(), select(transitionCommand("decoupled"))), 140);
    expect(state.ui.selection).not.toBeNull();
  });

  // Issue #46: con 15 s de plazo y latidos de 0.1 s, expira en el latido 150, no en el 151.
  test("sigue activa en el latido 149 y expira en el 150", () => {
    const selected = run(initial(), select(transitionCommand("decoupled")));
    expect(ticks(selected, 149).ui.selection).not.toBeNull();
    expect(ticks(selected, 150).ui.selection).toBeNull();
  });

  test("expira al cumplirse el plazo y queda en el SER con su hora", () => {
    const START_MS = 1_000_000;
    const fresh = createHmiState(testConfig, DEFAULT_SELECTION_TIMEOUT_SECONDS, "overview", START_MS);
    const state = ticks(run(fresh, select(transitionCommand("decoupled"))), 160);
    expect(state.ui.selection).toBeNull();
    const expired = state.simulation.events.find((event) => event.state === "expired");
    expect(expired?.code).toBe("CMD.TO_DECOUPLED");
    // El tiempo acumulado tiene redondeo (14.99999999999996): la marca se redondea al milisegundo.
    expect(expired?.timestampMs).toBe(START_MS + DEFAULT_SELECTION_TIMEOUT_SECONDS * 1000);
  });

  test("al expirar no se ejecuta la orden", () => {
    const state = ticks(run(initial(), select(transitionCommand("decoupled"))), 160);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
  });

  test("el plazo es configurable", () => {
    const short = createHmiState(testConfig, 2);
    const selected = run(short, select(transitionCommand("decoupled")));
    expect(selected.ui.selection?.expiresAtSeconds).toBe(2);
    expect(ticks(selected, 15).ui.selection).not.toBeNull();
    expect(ticks(selected, 25).ui.selection).toBeNull();
  });

  test("el plazo cuenta desde que se selecciona, no desde el arranque", () => {
    const later = run(ticks(initial(), 100), select(transitionCommand("decoupled")));
    expect(later.ui.selection?.selectedAtSeconds).toBeCloseTo(10, 9);
    expect(ticks(later, 140).ui.selection).not.toBeNull();
    expect(ticks(later, 160).ui.selection).toBeNull();
  });

  test("después de expirar se puede seleccionar de nuevo", () => {
    const expired = ticks(run(initial(), select(transitionCommand("decoupled"))), 160);
    const state = run(expired, select(transitionCommand("decoupled")));
    expect(state.ui.selection).not.toBeNull();
  });
});

describe("hmiReducer: orden de los eventos de las órdenes", () => {
  test("cada paso queda en su orden, con el más reciente primero", () => {
    const state = run(
      withStation(deblockedAt()),
      select(blockCommand()),
      cancel,
      select(deblockCommand()),
    );
    // Desbloquear con el convertidor ya desbloqueado se rechaza al seleccionar.
    expect(state.simulation.events.map((event) => `${event.code} ${event.state}`)).toEqual([
      "CMD.DEBLOCK rejected",
      "CMD.BLOCK cancelled",
      "CMD.BLOCK selected",
    ]);
    expect(state.simulation.events.map((event) => event.id)).toEqual([2, 1, 0]);
  });
});

describe("hmiReducer: pureza", () => {
  test("no modifica el estado recibido", () => {
    const state = initial();
    const copy = structuredClone(state);
    run(state, select(transitionCommand("decoupled")), execute, tick);
    expect(state).toEqual(copy);
  });
});

describe("hmiReducer: navegar entre ventanas", () => {
  test("empieza en la overview, o en la ventana indicada", () => {
    expect(initial().ui.activeWindow).toBe("overview");
    const inEvents = createHmiState(testConfig, DEFAULT_SELECTION_TIMEOUT_SECONDS, "events");
    expect(inEvents.ui.activeWindow).toBe("events");
  });

  test("navigate cambia la ventana activa", () => {
    const state = run(initial(), { type: "navigate", window: "events" });
    expect(state.ui.activeWindow).toBe("events");
  });

  test("navegar a la ventana actual no cambia nada", () => {
    const before = initial();
    expect(run(before, { type: "navigate", window: "overview" })).toBe(before);
  });

  test("navegar no toca la estación, la hora, la selección ni el registro", () => {
    const before = run(initial(), select(transitionCommand("decoupled")));
    const after = run(before, { type: "navigate", window: "trends" });
    expect(after.simulation).toBe(before.simulation);
    expect({ ...after.ui, activeWindow: "overview" }).toEqual(before.ui);
  });

  test("la simulación sigue avanzando en otra ventana", () => {
    const state = ticks(run(initial(), { type: "navigate", window: "alarms" }), 5);
    expect(state.simulation.timeSeconds).toBeCloseTo(5 * DT_SECONDS);
    expect(state.ui.activeWindow).toBe("alarms");
  });

  test("una orden confirmada se ejecuta aunque se haya navegado a otra ventana", () => {
    const state = run(
      initial(),
      select(transitionCommand("decoupled")),
      execute,
      { type: "navigate", window: "faults" },
      tick,
    );
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toContain("executed");
    expect(state.simulation.station.switchgear.Q1.kind).toBe("moving");
  });

  test("la selección expira aunque se esté en otra ventana", () => {
    const state = ticks(
      run(initial(), select(transitionCommand("decoupled")), { type: "navigate", window: "trends" }),
      160,
    );
    expect(state.ui.selection).toBeNull();
    expect(cmdStates(state, "CMD.TO_DECOUPLED")).toContain("expired");
  });
});

describe("hmiReducer: eventos del SER", () => {
  const START_MS = 1_000_000;
  const fresh = () =>
    createHmiState(testConfig, DEFAULT_SELECTION_TIMEOUT_SECONDS, "overview", START_MS);
  const codesAndStates = (state: HmiState) =>
    [...state.simulation.events].reverse().map((e) => `${e.code} ${e.state}`);

  test("empieza sin eventos", () => {
    expect(fresh().simulation.events).toEqual([]);
    expect(fresh().simulation.nextEventId).toBe(0);
  });

  test("seleccionar deja el evento 'seleccionada' con la marca de tiempo del arranque", () => {
    const state = run(fresh(), select(transitionCommand("decoupled")));
    expect(state.simulation.events).toEqual([
      { id: 0, code: "CMD.TO_DECOUPLED", state: "selected", timestampMs: START_MS },
    ]);
  });

  test("la marca de tiempo es el arranque más el tiempo simulado", () => {
    const state = run(ticks(fresh(), 25), select(transitionCommand("decoupled")));
    expect(state.simulation.events[0]?.timestampMs).toBe(START_MS + 2500);
  });

  test("una selección rechazada deja el evento 'rechazada' con su motivo", () => {
    const state = run(fresh(), select(transitionCommand("coupled"))); // no es vecino
    expect(state.simulation.events).toHaveLength(1);
    expect(state.simulation.events[0]).toMatchObject({ code: "CMD.TO_COUPLED", state: "rejected" });
    expect(state.simulation.events[0]?.detail).toContain("Transición no permitida");
  });

  test("cancelar deja el evento 'cancelada'", () => {
    const state = run(fresh(), select(transitionCommand("decoupled")), cancel);
    expect(codesAndStates(state)).toEqual(["CMD.TO_DECOUPLED selected", "CMD.TO_DECOUPLED cancelled"]);
  });

  test("al expirar la selección queda el evento 'expirada'", () => {
    const state = ticks(run(fresh(), select(transitionCommand("decoupled"))), 160);
    expect(codesAndStates(state)).toEqual(["CMD.TO_DECOUPLED selected", "CMD.TO_DECOUPLED expired"]);
    expect(state.simulation.events[0]?.timestampMs).toBeGreaterThanOrEqual(START_MS + 15000);
  });

  test("de stopped a decoupled: orden, maniobra de Q1 y cambio de estado", () => {
    const state = run(
      withStation(stationAt("stopped")),
      select(transitionCommand("decoupled")),
      execute,
      tick,
    );
    expect(codesAndStates(state)).toEqual([
      "CMD.TO_DECOUPLED selected",
      "CMD.TO_DECOUPLED executed",
      "Q1.POS moving",
      "STATION.STATE transition",
    ]);
  });

  test("al terminar la maniobra aparecen la posición final y el nuevo estado", () => {
    const state = ticks(
      run(withStation(stationAt("stopped")), select(transitionCommand("decoupled")), execute),
      30,
    );
    expect(codesAndStates(state).slice(-2)).toEqual(["Q1.POS closed", "STATION.STATE decoupled"]);
  });

  test("la consigna lleva su valor en MW en sus eventos", () => {
    const state = run(withStation(deblockedAt(0)), select(powerOrderCommand(300)), execute, tick);
    const power = state.simulation.events.filter((e) => e.code === "CMD.POWER_ORDER");
    expect(power.map((e) => e.state)).toEqual(["executed", "selected"]);
    expect(power.every((e) => e.valueMW === 300)).toBe(true);
  });

  test("desbloquear deja el evento del convertidor", () => {
    const coupled = { ...deblockedAt(0), converter: "blocked" as const, udcKV: 0 };
    const state = run(withStation(coupled), select(deblockCommand()), execute, tick);
    expect(codesAndStates(state)).toContain("CONVERTER.BLOCK deblocked");
  });

  test("una orden confirmada que se rechaza al ejecutar deja 'rechazada' con su motivo", () => {
    const state = run(
      withStation(stationAt("stopped")),
      select(transitionCommand("decoupled")),
      execute,
      select(transitionCommand("decoupled")), // todavía válida: Q1 aún no se movió
      execute,
      tick,
    );
    const rejected = state.simulation.events.find((e) => e.state === "rejected");
    expect(rejected).toMatchObject({ code: "CMD.TO_DECOUPLED" });
    expect(rejected?.detail).toEqual(expect.any(String));
  });

  test("el más reciente va primero y los id crecen sin repetirse", () => {
    const state = run(fresh(), select(transitionCommand("decoupled")), cancel, select(transitionCommand("decoupled")));
    expect(state.simulation.events.map((e) => e.id)).toEqual([2, 1, 0]);
  });

  test("navegar no genera eventos", () => {
    const before = run(fresh(), select(transitionCommand("stopped")));
    const after = run(before, { type: "navigate", window: "events" });
    expect(after.simulation.events).toBe(before.simulation.events);
  });

  test("el SER guarda como mucho MAX_EVENTS y descarta los más viejos", () => {
    let state = fresh();
    for (let i = 0; i < MAX_EVENTS + 5; i++) {
      state = run(state, select(transitionCommand("coupled"))); // se rechaza: un evento cada vez
    }
    expect(state.simulation.events).toHaveLength(MAX_EVENTS);
    expect(state.simulation.nextEventId).toBe(MAX_EVENTS + 5);
    expect(state.simulation.nextEventId - state.simulation.events.length).toBe(5); // descartados
    expect(state.simulation.events[0]?.id).toBe(MAX_EVENTS + 4); // el más nuevo
    expect(state.simulation.events.at(-1)?.id).toBe(5); // el más viejo que queda
  });

  test("el reducer no modifica el estado recibido al generar eventos", () => {
    const state = fresh();
    run(state, select(transitionCommand("stopped")), execute, tick);
    expect(state).toEqual(fresh());
  });
});

describe("hmiReducer: alarmas", () => {
  const START = 1_700_000_000_000;
  const fresh = () => createHmiState(testConfig, DEFAULT_SELECTION_TIMEOUT_SECONDS, "overview", START);
  const setTest = (code: TestAlarmCode, active: boolean): HmiAction => ({
    type: "set-test-alarm",
    code,
    active,
  });
  const alarmEvents = (state: HmiState) =>
    [...state.simulation.events].reverse().filter((e) => e.code.startsWith("ALARM."));
  const life = (state: HmiState, code: AlarmCode) => state.simulation.alarms.life[code];

  test("el instructor activa una alarma de prueba y se activa en el siguiente latido", () => {
    const forced = run(fresh(), setTest("ALARM.TEST_URGENT", true));
    expect(life(forced, "ALARM.TEST_URGENT")).toBe("normal"); // todavía no: lo hace el ciclo
    const state = run(forced, tick);
    expect(life(state, "ALARM.TEST_URGENT")).toBe("active-unacknowledged");
    expect(alarmEvents(state)).toMatchObject([
      { code: "ALARM.TEST_URGENT", state: "active-unacknowledged", timestampMs: START + 100 },
    ]);
  });

  test("ciclo de vida completo por el reducer, con un evento del SER por cambio", () => {
    const state = run(
      fresh(),
      setTest("ALARM.TEST_HIGH", true),
      tick,
      { type: "acknowledge-alarm", code: "ALARM.TEST_HIGH" },
      setTest("ALARM.TEST_HIGH", false),
      tick,
    );
    expect(life(state, "ALARM.TEST_HIGH")).toBe("normal");
    expect(alarmEvents(state).map((e) => e.state)).toEqual([
      "active-unacknowledged",
      "active-acknowledged",
      "normal",
    ]);
  });

  test("una alarma normalizada sin reconocer sigue visible hasta que se reconoce", () => {
    const state = run(fresh(), setTest("ALARM.TEST_LOW", true), tick, setTest("ALARM.TEST_LOW", false), tick);
    expect(life(state, "ALARM.TEST_LOW")).toBe("returned-unacknowledged");
    const acked = run(state, { type: "acknowledge-alarm", code: "ALARM.TEST_LOW" });
    expect(life(acked, "ALARM.TEST_LOW")).toBe("normal");
  });

  test("reconocer todas reconoce solo las de la lista que recibe", () => {
    const state = run(
      fresh(),
      setTest("ALARM.TEST_URGENT", true),
      setTest("ALARM.TEST_HIGH", true),
      setTest("ALARM.TEST_LOW", true),
      tick,
      { type: "acknowledge-alarms", codes: ["ALARM.TEST_HIGH"] },
    );
    expect(life(state, "ALARM.TEST_HIGH")).toBe("active-acknowledged");
    expect(life(state, "ALARM.TEST_URGENT")).toBe("active-unacknowledged");
    expect(life(state, "ALARM.TEST_LOW")).toBe("active-unacknowledged");
  });

  test("una estación inconsistent activa la alarma urgente a través del reducer", () => {
    const base = fresh();
    const station = stationAt("stopped");
    const inconsistent: HmiState = {
      ...base,
      simulation: {
        ...base.simulation,
        station: { ...station, switchgear: { ...station.switchgear, QE: { kind: "closed" }, Q2: { kind: "closed" } } },
      },
    };
    const state = run(inconsistent, tick);
    expect(life(state, "ALARM.INCONSISTENT")).toBe("active-unacknowledged");
  });

  test("reconocer y activar no son órdenes: no tocan la estación, la selección ni la interfaz", () => {
    const selected = run(fresh(), select(transitionCommand("decoupled")));
    const after = run(
      selected,
      setTest("ALARM.TEST_URGENT", true),
      tick,
      { type: "acknowledge-alarm", code: "ALARM.TEST_URGENT" },
      { type: "acknowledge-alarms", codes: ["ALARM.TEST_URGENT"] },
    );
    expect(after.ui.selection).toEqual(selected.ui.selection); // se pueden reconocer con una selección abierta
    expect(after.ui).toEqual(selected.ui);
    expect(after.simulation.station).toEqual(selected.simulation.station);
    expect(after.simulation.pending).toEqual([]);
  });

  test("reconocer una alarma que no está pendiente de reconocer no deja eventos", () => {
    const state = run(fresh(), { type: "acknowledge-alarm", code: "ALARM.TEST_URGENT" });
    expect(state.simulation.events).toEqual([]);
    expect(state.simulation.nextEventId).toBe(0);
  });

  test("el reducer no modifica el estado recibido al manejar alarmas", () => {
    const state = fresh();
    const copy = structuredClone(state);
    run(state, setTest("ALARM.TEST_URGENT", true), tick, { type: "acknowledge-alarm", code: "ALARM.TEST_URGENT" });
    expect(state).toEqual(copy);
  });
});

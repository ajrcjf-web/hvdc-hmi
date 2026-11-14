// Cada paso del flujo de una orden deja su evento en el SER, con el motivo en los rechazos.
// Con esto el SER (y el panel de eventos, que lo muestra) trae todo lo que mostraba el
// registro de órdenes de la overview, que se quitó (#68). La única diferencia: "Ejecutar"
// (el clic de confirmar) no es un evento: 100 ms después aparece ejecutada o rechazada.
import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import type { Station } from "../station.ts";
import { stationAt, testConfig } from "../testSupport.ts";
import { transitionCommand, type OperatorCommand } from "./commands.ts";
import { createHmiState, hmiReducer, type HmiAction, type HmiState } from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };
const execute: HmiAction = { type: "execute" };
const cancel: HmiAction = { type: "cancel" };
const select = (command: OperatorCommand): HmiAction => ({ type: "select", command });

const run = (state: HmiState, ...actions: HmiAction[]) => actions.reduce(hmiReducer, state);
const ticks = (state: HmiState, count: number) =>
  run(state, ...Array.from({ length: count }, () => tick));

const withStation = (station: Station): HmiState => {
  const state = createHmiState(testConfig);
  return { ...state, simulation: { ...state.simulation, station } };
};

// Los eventos de una señal, en orden cronológico (el SER guarda el más reciente primero).
const eventsOf = (state: HmiState, code: string): SerEvent[] =>
  [...state.simulation.events].reverse().filter((event) => event.code === code);
const statesOf = (state: HmiState, code: string) => eventsOf(state, code).map((e) => e.state);

const toDecoupled = transitionCommand("decoupled");

describe("el SER trae cada paso del flujo de una orden", () => {
  test("seleccionar", () => {
    const state = run(withStation(stationAt("stopped")), select(toDecoupled));
    expect(statesOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected"]);
  });

  test("cancelar", () => {
    const state = run(withStation(stationAt("stopped")), select(toDecoupled), cancel);
    expect(statesOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "cancelled"]);
  });

  test("expirar sin confirmar", () => {
    const state = ticks(run(withStation(stationAt("stopped")), select(toDecoupled)), 160);
    expect(statesOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "expired"]);
  });

  test("ejecutar: aparece como ejecutada, y 'Ejecutar' en sí no es un evento", () => {
    const afterExecute = run(withStation(stationAt("stopped")), select(toDecoupled), execute);
    expect(statesOf(afterExecute, "CMD.TO_DECOUPLED")).toEqual(["selected"]); // aún no

    const state = run(afterExecute, tick);
    expect(statesOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "executed"]);
  });

  test("rechazo al seleccionar, con el motivo", () => {
    const state = run(withStation(stationAt("stopped")), select(transitionCommand("coupled")));
    const [rejected] = eventsOf(state, "CMD.TO_COUPLED");
    expect(rejected).toMatchObject({ state: "rejected" });
    expect(rejected?.detail).toContain("Transición no permitida");
  });

  test("rechazo al ejecutar, con el motivo", () => {
    // Se selecciona una orden válida y, antes de ejecutarla, la estación pasa a manual:
    // la lógica la rechaza igual al ejecutar.
    let state = run(withStation(stationAt("stopped")), select(toDecoupled));
    state = { ...state, simulation: { ...state.simulation, station: { ...state.simulation.station, mode: "manual" } } };
    state = run(state, execute, tick);

    expect(statesOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "rejected"]);
    expect(eventsOf(state, "CMD.TO_DECOUPLED")[1]?.detail).toContain("modo automático");
  });

  test("cada evento lleva marca de tiempo del SER", () => {
    const state = run(withStation(stationAt("stopped")), select(toDecoupled));
    expect(state.simulation.events[0]?.timestampMs).toBeGreaterThan(0);
  });
});

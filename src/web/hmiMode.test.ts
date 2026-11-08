// Modo de operación y mando por equipo a través del reducer (select-before-operate).
import { describe, expect, test } from "vitest";
import type { Station } from "../station.ts";
import { deriveState } from "../stationState.ts";
import { stationAt, testConfig } from "../testSupport.ts";
import { modeCommand, switchCommand, transitionCommand, type OperatorCommand } from "./commands.ts";
import { createHmiState, hmiReducer, type HmiAction, type HmiState } from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };
const execute: HmiAction = { type: "execute" };
const cancel: HmiAction = { type: "cancel" };
const select = (command: OperatorCommand): HmiAction => ({ type: "select", command });

function run(state: HmiState, ...actions: HmiAction[]): HmiState {
  return actions.reduce(hmiReducer, state);
}
const ticks = (state: HmiState, count: number) =>
  run(state, ...Array.from({ length: count }, () => tick));

const withStation = (station: Station): HmiState => {
  const state = createHmiState(testConfig);
  return { ...state, simulation: { ...state.simulation, station } };
};
const manual = (station: Station): Station => ({ ...station, mode: "manual" });

// Selecciona, ejecuta y deja correr el latido en que se ejecuta la orden.
const operate = (state: HmiState, command: OperatorCommand) =>
  run(state, select(command), execute, tick);

// El SER guarda el evento más reciente primero; aquí se leen en orden cronológico.
const eventsOf = (state: HmiState, code: string) =>
  [...state.simulation.events].reverse().filter((event) => event.code === code).map((event) => event.state);
const kinds = (state: HmiState) => state.ui.log.map((entry) => entry.kind);

describe("reducer: cambio de modo", () => {
  test("seleccionar abre la selección y no cambia el modo", () => {
    const state = run(withStation(stationAt("stopped")), select(modeCommand("manual")));
    expect(state.ui.selection?.command).toEqual(modeCommand("manual"));
    expect(state.simulation.station.mode).toBe("automatic");
    expect(eventsOf(state, "CMD.MODE_MANUAL")).toEqual(["selected"]);
  });

  test("ejecutar cambia el modo en el siguiente latido y queda en el registro y el SER", () => {
    const state = operate(withStation(stationAt("stopped")), modeCommand("manual"));
    expect(state.simulation.station.mode).toBe("manual");
    expect(kinds(state)).toEqual(["done", "execute-ordered", "selected"]);
    expect(state.ui.log[2]).toMatchObject({ label: "Pasar a manual" });
    expect(eventsOf(state, "CMD.MODE_MANUAL")).toEqual(["selected", "executed"]);
    expect(eventsOf(state, "STATION.MODE")).toEqual(["manual"]);
  });

  test("cancelar deja el modo como estaba", () => {
    const state = run(withStation(stationAt("stopped")), select(modeCommand("manual")), cancel, tick);
    expect(state.simulation.station.mode).toBe("automatic");
    expect(kinds(state)).toContain("cancelled");
    expect(eventsOf(state, "STATION.MODE")).toEqual([]);
  });

  test("la selección expira sin cambiar el modo", () => {
    const state = ticks(run(withStation(stationAt("stopped")), select(modeCommand("manual"))), 160);
    expect(state.ui.selection).toBeNull();
    expect(state.simulation.station.mode).toBe("automatic");
    expect(kinds(state)).toContain("expired");
  });

  test("pedir el modo en que ya está se rechaza al seleccionar, con motivo", () => {
    const state = run(withStation(stationAt("stopped")), select(modeCommand("automatic")));
    expect(state.ui.selection).toBeNull();
    expect(state.ui.selectionNotice).toContain("ya está en modo automático");
    expect(kinds(state)).toEqual(["selection-rejected"]);
  });
});

describe("reducer: rechazos por modo (la lógica decide, no la interfaz)", () => {
  test("una orden de estado en manual se rechaza al seleccionar", () => {
    const state = run(withStation(manual(stationAt("stopped"))), select(transitionCommand("decoupled")));
    expect(state.ui.selection).toBeNull();
    expect(state.ui.selectionNotice).toContain("solo se aceptan en modo automático");
    expect(eventsOf(state, "CMD.TO_DECOUPLED")).toEqual(["rejected"]);
  });

  test("una orden por equipo en automático se rechaza al seleccionar", () => {
    const state = run(withStation(stationAt("stopped")), select(switchCommand("Q1", "closed")));
    expect(state.ui.selection).toBeNull();
    expect(state.ui.selectionNotice).toContain("solo se aceptan en modo manual");
    expect(eventsOf(state, "CMD.Q1_CLOSE")).toEqual(["rejected"]);
  });

  test("una orden confirmada puede rechazarse igual si el modo cambió entre medio", () => {
    // Se selecciona la orden de estado en automático y, antes de ejecutarla, pasa a manual.
    let state = run(withStation(stationAt("stopped")), select(transitionCommand("decoupled")));
    state = { ...state, simulation: { ...state.simulation, station: manual(state.simulation.station) } };
    state = run(state, execute, tick);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
    expect(kinds(state)[0]).toBe("failed");
    expect(state.ui.log[0]?.reason).toContain("modo automático");
    expect(eventsOf(state, "CMD.TO_DECOUPLED")).toEqual(["selected", "rejected"]);
  });
});

describe("reducer: mando por equipo", () => {
  test("cerrar Q1 en manual: selecciona, ejecuta y la maniobra avanza", () => {
    let state = operate(withStation(manual(stationAt("stopped"))), switchCommand("Q1", "closed"));
    expect(state.simulation.station.switchgear.Q1.kind).toBe("moving");
    expect(eventsOf(state, "CMD.Q1_CLOSE")).toEqual(["selected", "executed"]);
    expect(eventsOf(state, "Q1.POS")).toEqual(["moving"]);

    state = ticks(state, 25); // Q1 tarda 2 s en testConfig
    expect(deriveState(state.simulation.station.switchgear)).toBe("decoupled");
    expect(eventsOf(state, "Q1.POS")).toEqual(["moving", "closed"]);
  });

  test("un enclavamiento rechaza al seleccionar, con el motivo de la lógica", () => {
    // Q2 no cierra con Q1 abierto.
    const state = run(withStation(manual(stationAt("stopped"))), select(switchCommand("Q2", "closed")));
    expect(state.ui.selection).toBeNull();
    expect(state.ui.selectionNotice).toContain("Q1 sin cerrar");
    expect(kinds(state)).toEqual(["selection-rejected"]);
  });
});

describe("reducer: escenario de inconsistent", () => {
  test("de inconsistent a stopped con las órdenes del operador", () => {
    // Coupled; el operador pasa a manual y abre Q1 con Q2 cerrado.
    let state = withStation(stationAt("coupled"));
    state = operate(state, modeCommand("manual"));
    state = ticks(operate(state, switchCommand("Q1", "open")), 25);
    expect(deriveState(state.simulation.station.switchgear)).toBe("inconsistent");

    // Volver a automático se rechaza al seleccionar.
    state = run(state, select(modeCommand("automatic")));
    expect(state.ui.selection).toBeNull();
    expect(state.ui.selectionNotice).toContain("inconsistentes");

    // Se normaliza abriendo Q2, y entonces sí se vuelve a automático.
    state = ticks(operate(state, switchCommand("Q2", "open")), 50); // Q2 tarda 4 s
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
    state = operate(state, modeCommand("automatic"));
    expect(state.simulation.station.mode).toBe("automatic");
    expect(eventsOf(state, "STATION.MODE")).toEqual(["manual", "automatic"]);
  });
});

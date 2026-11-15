// Provocar y despejar fallas desde la ventana del instructor, a través del reducer.
import { describe, expect, test } from "vitest";
import type { FaultKind } from "../protections.ts";
import type { Station } from "../station.ts";
import { deblockedAt, stationAt, testConfig } from "../testSupport.ts";
import { describeCommand } from "./commandView.ts";
import { describeRelay86, lastProtection } from "./relay86View.ts";
import { reset86Command, transitionCommand } from "./commands.ts";
import { createHmiState, hmiReducer, type HmiAction, type HmiState } from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };
const run = (state: HmiState, ...actions: HmiAction[]) => actions.reduce(hmiReducer, state);
const ticks = (state: HmiState, count: number) =>
  run(state, ...Array.from({ length: count }, () => tick));
const provoke = (kind: FaultKind): HmiAction => ({ type: "set-fault", fault: { kind } });
const clear = (kind: FaultKind): HmiAction => ({ type: "clear-fault", kind });

const withStation = (station: Station): HmiState => {
  const state = createHmiState(testConfig);
  return { ...state, simulation: { ...state.simulation, station } };
};
const codes = (state: HmiState) => [...state.simulation.events].reverse().map((e) => e.code);

describe("reducer: fallas del instructor", () => {
  test("provocar una falla solo cambia la causa: la protección actúa en el siguiente latido", () => {
    const forced = run(withStation(deblockedAt(300)), provoke("transformer"));
    expect(forced.simulation.station.faults.transformer).toBe(true);
    expect(forced.simulation.station.relay86.locked).toBe(false);

    const state = run(forced, tick);
    expect(state.simulation.station.relay86).toEqual({
      locked: true,
      operated: ["transformerDifferential"],
    });
  });

  test("las dos fallas se provocan y se despejan por separado", () => {
    const state = run(withStation(stationAt("stopped")), provoke("transformer"), provoke("converter"));
    expect(state.simulation.station.faults).toEqual({ transformer: true, converter: true });
    expect(run(state, clear("transformer")).simulation.station.faults).toEqual({
      transformer: false,
      converter: true,
    });
  });

  test("provocar una falla ya presente, o despejar una que no está, no cambia nada", () => {
    const state = run(withStation(stationAt("stopped")), provoke("converter"));
    expect(run(state, provoke("converter"))).toEqual(state);
    const none = withStation(stationAt("stopped"));
    expect(run(none, clear("converter"))).toEqual(none);
  });

  test("el SER no registra lo que hace el instructor, solo lo que reportan los equipos", () => {
    const state = run(withStation(stationAt("stopped")), provoke("converter"), clear("converter"));
    expect(state.simulation.events).toEqual([]);
  });

  test("despejar la falla no suelta el 86", () => {
    const state = run(withStation(deblockedAt(300)), provoke("converter"), tick, clear("converter"), tick);
    expect(state.simulation.station.relay86.locked).toBe(true);
  });

  test("no son órdenes: valen con una selección abierta y no la tocan", () => {
    const selected = run(withStation(stationAt("stopped")), {
      type: "select",
      command: transitionCommand("decoupled"),
    });
    const state = run(selected, provoke("transformer"), clear("transformer"));
    expect(state.ui.selection).toEqual(selected.ui.selection);
  });

  test("falla en una zona sin energizar: nadie la ve; actúa al energizarse (cierre sobre falla)", () => {
    // stopped, falla del transformador: pasan los latidos y no pasa nada.
    let state = ticks(run(withStation(stationAt("stopped")), provoke("transformer")), 5);
    expect(state.simulation.station.relay86.locked).toBe(false);
    expect(codes(state)).toEqual([]);

    // El operador cierra Q1 (decoupled): al llegar a cerrado la zona se energiza y actúa.
    state = ticks(
      run(state, { type: "select", command: transitionCommand("decoupled") }, { type: "execute" }),
      40,
    );
    expect(state.simulation.station.relay86.locked).toBe(true);
    expect(codes(state)).toContain("PROT.TRANSFORMER_DIFFERENTIAL");
  });
});

describe("lo que ve la overview después de una falla", () => {
  test("el indicador del 86 y la última protección siguen al disparo y al reset", () => {
    let state = withStation(deblockedAt(300));
    expect(describeRelay86(state.simulation.station).locked).toBe(false);
    expect(lastProtection(state.simulation.events)).toBeNull();

    state = run(state, provoke("converter"), tick);
    expect(describeRelay86(state.simulation.station)).toMatchObject({ locked: true, label: "RELÉ 86 ENCLAVADO" });
    expect(lastProtection(state.simulation.events)?.name).toBe("Protección del convertidor");
    expect(describeRelay86(state.simulation.station).causes[0]?.present).toBe(true);

    // Despejada la falla, el indicador sigue enclavado y la causa figura despejada.
    state = run(state, clear("converter"), tick);
    expect(describeRelay86(state.simulation.station).locked).toBe(true);
    expect(describeRelay86(state.simulation.station).causes[0]?.present).toBe(false);

    // Tras el reset el indicador vuelve a normal; la última protección queda como dato histórico.
    state = run(state, { type: "select", command: reset86Command() }, { type: "execute" }, tick);
    expect(describeRelay86(state.simulation.station).locked).toBe(false);
    expect(describeRelay86(state.simulation.station).causes).toEqual([]);
    expect(lastProtection(state.simulation.events)?.name).toBe("Protección del convertidor");
  });
});

describe("ventana de confirmación del reset con las causas", () => {
  test("con la falla presente la causa figura presente y la orden se rechazaría; despejada, ok", () => {
    let state = run(withStation(deblockedAt(300)), provoke("converter"), tick);
    const config = state.simulation.config;

    let view = describeCommand(reset86Command(), state.simulation.station, config);
    expect(view.relay86?.causes).toEqual([
      { element: "converterProtection", name: "Protección del convertidor", present: true },
    ]);
    expect(view.check.ok).toBe(false);

    state = run(state, clear("converter"));
    view = describeCommand(reset86Command(), state.simulation.station, config);
    expect(view.relay86?.causes[0]?.present).toBe(false);
    expect(view.check).toEqual({ ok: true });
  });
});

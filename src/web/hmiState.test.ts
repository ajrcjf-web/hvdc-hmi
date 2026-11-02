import { describe, expect, test } from "vitest";
import { deriveState } from "../stationState.ts";
import { testConfig } from "../testSupport.ts";
import {
  blockCommand,
  createHmiState,
  deblockCommand,
  DT_SECONDS,
  hmiReducer,
  MAX_LOG_ENTRIES,
  powerOrderCommand,
  transitionCommand,
  type HmiAction,
  type HmiState,
  type OperatorCommand,
} from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };

const command = (c: OperatorCommand): HmiAction => ({ type: "command", command: c });

function run(state: HmiState, ...actions: HmiAction[]): HmiState {
  return actions.reduce(hmiReducer, state);
}

function ticks(state: HmiState, count: number): HmiState {
  return run(state, ...Array.from({ length: count }, () => tick));
}

const initial = () => createHmiState(testConfig);

describe("hmiReducer: reloj", () => {
  test("un latido avanza el tiempo dt", () => {
    expect(run(initial(), tick).timeSeconds).toBe(DT_SECONDS);
  });

  test("el tiempo se acumula (con redondeo decimal)", () => {
    expect(ticks(initial(), 10).timeSeconds).toBeCloseTo(1, 9);
  });
});

describe("hmiReducer: órdenes", () => {
  test("una orden queda pendiente y no cambia la estación hasta el latido", () => {
    const state = run(initial(), command(transitionCommand("decoupled")));
    expect(state.pending).toHaveLength(1);
    expect(state.log).toEqual([]);
    expect(deriveState(state.station.switchgear)).toBe("stopped");
  });

  test("el latido ejecuta la orden pendiente y la registra", () => {
    const state = run(initial(), command(transitionCommand("decoupled")), tick);
    expect(state.pending).toEqual([]);
    expect(deriveState(state.station.switchgear)).toBe("transition");
    expect(state.log).toEqual([
      { id: 0, timeSeconds: 0, label: "Ir a decoupled", reason: null },
    ]);
  });

  test("una orden dada con el tiempo ya con redondeo decimal también se ejecuta", () => {
    // Después de 3 latidos el tiempo es 0.30000000000000004, no 0.3.
    const state = run(
      ticks(initial(), 3),
      command(transitionCommand("decoupled")),
      tick,
    );
    expect(state.log).toHaveLength(1);
  });

  test("una orden rechazada se registra con su motivo y no cambia la estación", () => {
    const before = initial();
    const state = run(before, command(transitionCommand("coupled")), tick);
    expect(state.log[0]).toMatchObject({ label: "Ir a coupled" });
    expect(state.log[0]?.reason).toContain("Transición no permitida");
    expect(state.station).toEqual(before.station);
  });

  test("varias órdenes en el mismo latido se aplican en orden", () => {
    const state = run(initial(), command(blockCommand()), command(deblockCommand()), tick);
    // La más reciente primero.
    expect(state.log.map((e) => e.label)).toEqual(["Desbloquear", "Bloquear"]);
    expect(state.log.map((e) => e.id)).toEqual([1, 0]);
  });

  test("la consigna rechazada explica por qué", () => {
    const state = run(initial(), command(powerOrderCommand(300)), tick);
    expect(state.log[0]?.label).toBe("Consigna 300 MW");
    expect(state.log[0]?.reason).toContain("coupled");
  });

  test("el registro guarda solo las últimas entradas", () => {
    let state = initial();
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) {
      state = run(state, command(blockCommand()), tick);
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.log[0]?.id).toBe(MAX_LOG_ENTRIES + 4);
  });
});

describe("hmiReducer: pureza", () => {
  test("no modifica el estado recibido", () => {
    const state = initial();
    run(state, command(blockCommand()), tick);
    expect(state).toEqual(initial());
  });
});

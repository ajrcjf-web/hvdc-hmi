import { describe, expect, test } from "vitest";
import type { Station } from "../station.ts";
import { deriveState } from "../stationState.ts";
import { deblockedAt, testConfig } from "../testSupport.ts";
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
  MAX_LOG_ENTRIES,
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
const withStation = (station: Station) => ({ ...initial(), station });

const kinds = (state: HmiState) => state.log.map((entry) => entry.kind);

describe("hmiReducer: reloj", () => {
  test("un latido avanza el tiempo dt", () => {
    expect(run(initial(), tick).timeSeconds).toBe(DT_SECONDS);
  });

  test("el tiempo se acumula (con redondeo decimal)", () => {
    expect(ticks(initial(), 10).timeSeconds).toBeCloseTo(1, 9);
  });
});

describe("hmiReducer: seleccionar", () => {
  test("una orden válida abre la selección y se registra", () => {
    const state = run(initial(), select(transitionCommand("decoupled")));
    expect(state.selection).toMatchObject({
      command: { kind: "transition", to: "decoupled" },
      selectedAtSeconds: 0,
      expiresAtSeconds: DEFAULT_SELECTION_TIMEOUT_SECONDS,
    });
    expect(state.log).toEqual([
      { id: 0, timeSeconds: 0, kind: "selected", label: "Ir a decoupled", reason: null },
    ]);
  });

  test("seleccionar no cambia la estación ni deja órdenes pendientes", () => {
    const before = initial();
    const state = run(before, select(transitionCommand("decoupled")));
    expect(state.station).toEqual(before.station);
    expect(deriveState(state.station.switchgear)).toBe("stopped");
    expect(state.pending).toEqual([]);
  });

  test("una orden que sería rechazada no abre la selección y explica por qué", () => {
    const state = run(initial(), select(transitionCommand("coupled")));
    expect(state.selection).toBeNull();
    expect(state.log[0]).toMatchObject({ kind: "selection-rejected", label: "Ir a coupled" });
    expect(state.log[0]?.reason).toContain("Transición no permitida");
    expect(state.selectionNotice).toContain("Transición no permitida");
  });

  test("la verificación usa los enclavamientos de la estación (consigna sin convertidor)", () => {
    const state = run(initial(), select(powerOrderCommand(300)));
    expect(state.selection).toBeNull();
    expect(state.log[0]?.reason).toContain("coupled");
  });

  test("una consigna que no es un número no se puede seleccionar", () => {
    const state = run(withStation(deblockedAt()), select(powerOrderCommand(Number.NaN)));
    expect(state.selection).toBeNull();
    expect(state.log[0]?.label).toBe("Consigna (valor no válido)");
  });

  test("una consigna válida se puede seleccionar", () => {
    const state = run(withStation(deblockedAt()), select(powerOrderCommand(300)));
    expect(state.selection?.command).toEqual({ kind: "powerOrder", orderMW: 300 });
  });

  test("solo hay una selección a la vez: la segunda se rechaza", () => {
    const state = run(
      initial(),
      select(transitionCommand("decoupled")),
      select(transitionCommand("earthed")),
    );
    expect(state.selection?.command).toEqual({ kind: "transition", to: "decoupled" });
    expect(kinds(state)).toEqual(["selection-rejected", "selected"]);
    expect(state.log[0]?.reason).toContain("selección activa");
  });

  test("una selección válida borra el aviso del rechazo anterior", () => {
    const state = run(
      initial(),
      select(transitionCommand("coupled")),
      select(transitionCommand("decoupled")),
    );
    expect(state.selectionNotice).toBeNull();
  });
});

describe("hmiReducer: seleccionar durante una maniobra", () => {
  test("el aviso y el registro indican qué equipo se mueve", () => {
    // Ir a decoupled deja a Q1 cerrándose; mientras tanto no se acepta otra orden de estado.
    const moving = run(initial(), select(transitionCommand("decoupled")), execute, tick);
    const state = run(moving, select(transitionCommand("stopped")));
    expect(state.selection).toBeNull();
    expect(state.selectionNotice).toContain("Q1 en maniobra (cierre)");
    expect(state.log[0]).toMatchObject({ kind: "selection-rejected" });
    expect(state.log[0]?.reason).toContain("Q1 en maniobra (cierre)");
  });
});

describe("hmiReducer: ejecutar", () => {
  test("la orden queda pendiente y la selección se cierra, sin cambiar aún la estación", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), execute);
    expect(state.selection).toBeNull();
    expect(state.pending).toHaveLength(1);
    expect(deriveState(state.station.switchgear)).toBe("stopped");
    expect(kinds(state)).toEqual(["execute-ordered", "selected"]);
  });

  test("el latido siguiente la ejecuta y la registra", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), execute, tick);
    expect(state.pending).toEqual([]);
    expect(deriveState(state.station.switchgear)).toBe("transition");
    expect(kinds(state)).toEqual(["done", "execute-ordered", "selected"]);
  });

  test("también se ejecuta con el tiempo ya con redondeo decimal", () => {
    // Después de 3 latidos el tiempo es 0.30000000000000004, no 0.3.
    const state = run(ticks(initial(), 3), select(transitionCommand("decoupled")), execute, tick);
    expect(kinds(state)[0]).toBe("done");
  });

  test("una orden confirmada puede rechazarse al ejecutar si la estación cambió", () => {
    const selected = run(withStation(deblockedAt()), select(powerOrderCommand(300)));
    expect(selected.selection).not.toBeNull();

    // Entre seleccionar y ejecutar, la tensión se cae.
    const changed: HmiState = { ...selected, station: { ...selected.station, udcKV: 0 } };
    const state = run(changed, execute, tick);

    expect(kinds(state)).toEqual(["failed", "execute-ordered", "selected"]);
    expect(state.log[0]?.reason).toContain("Udc");
    expect(state.station.powerOrderMW).toBe(0);
  });

  test("sin selección no hace nada", () => {
    const state = initial();
    expect(run(state, execute)).toBe(state);
  });
});

describe("hmiReducer: cancelar", () => {
  test("cierra la selección, la registra y no ejecuta nada", () => {
    const state = run(initial(), select(transitionCommand("decoupled")), cancel, tick);
    expect(state.selection).toBeNull();
    expect(kinds(state)).toEqual(["cancelled", "selected"]);
    expect(deriveState(state.station.switchgear)).toBe("stopped");
  });

  test("después de cancelar se puede seleccionar otra orden", () => {
    const state = run(
      initial(),
      select(transitionCommand("decoupled")),
      cancel,
      select(transitionCommand("earthed")),
    );
    expect(state.selection?.command).toEqual({ kind: "transition", to: "earthed" });
  });

  test("sin selección no hace nada", () => {
    const state = initial();
    expect(run(state, cancel)).toBe(state);
  });
});

describe("hmiReducer: expiración (tiempo simulado)", () => {
  test("no expira antes del plazo", () => {
    const state = ticks(run(initial(), select(transitionCommand("decoupled"))), 140);
    expect(state.selection).not.toBeNull();
  });

  test("expira al cumplirse el plazo y queda registrada con su hora", () => {
    const state = ticks(run(initial(), select(transitionCommand("decoupled"))), 160);
    expect(state.selection).toBeNull();
    const expired = state.log.find((entry) => entry.kind === "expired");
    expect(expired?.label).toBe("Ir a decoupled");
    // El tiempo acumulado tiene redondeo: puede ser un latido después.
    expect(expired?.timeSeconds).toBeGreaterThanOrEqual(DEFAULT_SELECTION_TIMEOUT_SECONDS);
    expect(expired?.timeSeconds).toBeLessThan(DEFAULT_SELECTION_TIMEOUT_SECONDS + 0.2);
  });

  test("al expirar no se ejecuta la orden", () => {
    const state = ticks(run(initial(), select(transitionCommand("decoupled"))), 160);
    expect(deriveState(state.station.switchgear)).toBe("stopped");
  });

  test("el plazo es configurable", () => {
    const short = createHmiState(testConfig, 2);
    const selected = run(short, select(transitionCommand("decoupled")));
    expect(selected.selection?.expiresAtSeconds).toBe(2);
    expect(ticks(selected, 15).selection).not.toBeNull();
    expect(ticks(selected, 25).selection).toBeNull();
  });

  test("el plazo cuenta desde que se selecciona, no desde el arranque", () => {
    const later = run(ticks(initial(), 100), select(transitionCommand("decoupled")));
    expect(later.selection?.selectedAtSeconds).toBeCloseTo(10, 9);
    expect(ticks(later, 140).selection).not.toBeNull();
    expect(ticks(later, 160).selection).toBeNull();
  });

  test("después de expirar se puede seleccionar de nuevo", () => {
    const expired = ticks(run(initial(), select(transitionCommand("decoupled"))), 160);
    const state = run(expired, select(transitionCommand("decoupled")));
    expect(state.selection).not.toBeNull();
  });
});

describe("hmiReducer: registro", () => {
  test("cada paso queda en su orden, con la más reciente primero", () => {
    const state = run(
      withStation(deblockedAt()),
      select(blockCommand()),
      cancel,
      select(deblockCommand()),
    );
    // Desbloquear con el convertidor ya desbloqueado se rechaza al seleccionar.
    expect(kinds(state)).toEqual(["selection-rejected", "cancelled", "selected"]);
    expect(state.log.map((entry) => entry.id)).toEqual([2, 1, 0]);
  });

  test("guarda solo las últimas entradas", () => {
    let state = initial();
    for (let i = 0; i < MAX_LOG_ENTRIES + 5; i++) {
      state = run(state, select(blockCommand()));
    }
    expect(state.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(state.log[0]?.id).toBe(MAX_LOG_ENTRIES + 4);
  });
});

describe("hmiReducer: pureza", () => {
  test("no modifica el estado recibido", () => {
    const state = initial();
    run(state, select(transitionCommand("decoupled")), execute, tick);
    expect(state).toEqual(initial());
  });
});

// El escenario completo de una falla, de punta a punta, a través del reducer
// (select-before-operate): falla, disparo, alarmas, reset rechazado con la falla presente,
// despeje, reset aceptado y normalización de la estación hasta volver a transmitir potencia.
import { describe, expect, test } from "vitest";
import type { AlarmCode } from "../alarms.ts";
import type { FaultKind } from "../protections.ts";
import { clearFault, setFault } from "../simulationState.ts";
import { deriveState } from "../stationState.ts";
import { deblockedAt, testConfig } from "../testSupport.ts";
import {
  deblockCommand,
  modeCommand,
  powerOrderCommand,
  reset86Command,
  switchCommand,
  transitionCommand,
  type OperatorCommand,
} from "./commands.ts";
import { createHmiState, hmiReducer, type HmiAction, type HmiState } from "./hmiState.ts";

const tick: HmiAction = { type: "tick" };
const run = (state: HmiState, ...actions: HmiAction[]) => actions.reduce(hmiReducer, state);
const ticks = (state: HmiState, count: number) =>
  run(state, ...Array.from({ length: count }, () => tick));
// Selecciona, ejecuta y deja correr el latido en que se ejecuta la orden.
const operate = (state: HmiState, command: OperatorCommand) =>
  run(state, { type: "select", command }, { type: "execute" }, tick);

// El instructor provoca y despeja fallas (no son órdenes: no pasan por el reducer todavía).
const provoke = (state: HmiState, kind: FaultKind): HmiState => ({
  ...state,
  simulation: setFault(state.simulation, { kind }),
});
const clear = (state: HmiState, kind: FaultKind): HmiState => ({
  ...state,
  simulation: clearFault(state.simulation, kind),
});

const life = (state: HmiState, code: AlarmCode) => state.simulation.alarms.life[code];
// Los eventos del SER de una señal, en orden cronológico.
const states = (state: HmiState, code: string) =>
  [...state.simulation.events].reverse().filter((e) => e.code === code).map((e) => e.state);
const detailOf = (state: HmiState, code: string) =>
  state.simulation.events.find((e) => e.code === code)?.detail;

describe("escenario completo: falla, disparo, reset y normalización", () => {
  // Estación en coupled, convertidor desbloqueado y 300 MW, en automático.
  const start = (): HmiState => {
    const state = createHmiState(testConfig);
    return { ...state, simulation: { ...state.simulation, station: deblockedAt(300) } };
  };

  test("de la falla al servicio normal", () => {
    // 1. Falla y disparo: en el mismo ciclo, con la estación inconsistent.
    let state = ticks(provoke(start(), "converter"), 1);
    const { station } = state.simulation;
    expect(station.relay86.locked).toBe(true);
    expect(station).toMatchObject({ converter: "blocked", powerMW: 0, powerOrderMW: 0, udcKV: 0 });
    expect(station.switchgear.Q1).toEqual({ kind: "open" });
    expect(station.switchgear.Q2).toEqual({ kind: "closed" });
    expect(deriveState(station.switchgear)).toBe("inconsistent");

    // 2. Las alarmas de la protección y del 86 están activas (y la de inconsistencia).
    expect(life(state, "ALARM.PROT_CONVERTER")).toBe("active-unacknowledged");
    expect(life(state, "ALARM.RELAY86_LOCKED")).toBe("active-unacknowledged");
    expect(life(state, "ALARM.INCONSISTENT")).toBe("active-unacknowledged");

    // 3. El operador pasa a manual para normalizar (se acepta desde inconsistent).
    state = operate(state, modeCommand("manual"));
    expect(state.simulation.station.mode).toBe("manual");

    // 4. Intenta resetear con la falla presente: se rechaza al seleccionar, con su motivo,
    //    y el 86 sigue enclavado.
    state = run(state, { type: "select", command: reset86Command() });
    expect(state.ui.selection).toBeNull();
    expect(states(state, "CMD.RESET_86")).toEqual(["rejected"]);
    expect(detailOf(state, "CMD.RESET_86")).toContain(
      "la causa sigue presente (Protección del convertidor)",
    );
    expect(state.simulation.station.relay86.locked).toBe(true);

    // 5. El instructor despeja la falla: la alarma de la protección se normaliza (la señal
    //    de que se puede resetear); la del 86 sigue activa.
    state = ticks(clear(state, "converter"), 1);
    expect(life(state, "ALARM.PROT_CONVERTER")).toBe("returned-unacknowledged");
    expect(life(state, "ALARM.RELAY86_LOCKED")).toBe("active-unacknowledged");
    expect(state.simulation.station.relay86.locked).toBe(true);

    // 6. El reset se acepta: el 86 se libera y su alarma se normaliza. Queda en el SER.
    state = operate(state, reset86Command());
    expect(states(state, "CMD.RESET_86")).toEqual(["rejected", "selected", "executed"]);
    expect(state.simulation.station.relay86).toEqual({ locked: false, operated: [] });
    expect(life(state, "ALARM.RELAY86_LOCKED")).toBe("returned-unacknowledged");
    expect(states(state, "RELAY86.LOCKOUT")).toEqual(["locked", "normal"]);
    // La estación sigue inconsistent: el reset no mueve ningún equipo.
    expect(deriveState(state.simulation.station.switchgear)).toBe("inconsistent");
    expect(life(state, "ALARM.INCONSISTENT")).toBe("active-unacknowledged");

    // 7. Normaliza la estación: abre Q2 (la salida de inconsistent) y llega a stopped.
    state = operate(state, switchCommand("Q2", "open"));
    state = ticks(state, 50);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");
    expect(life(state, "ALARM.INCONSISTENT")).toBe("returned-unacknowledged");

    // 8. Vuelve a automático y arma la secuencia: decoupled, coupled, desbloquear y consigna.
    state = operate(state, modeCommand("automatic"));
    expect(state.simulation.station.mode).toBe("automatic");
    state = ticks(operate(state, transitionCommand("decoupled")), 30);
    expect(deriveState(state.simulation.station.switchgear)).toBe("decoupled");
    state = ticks(operate(state, transitionCommand("coupled")), 50);
    expect(deriveState(state.simulation.station.switchgear)).toBe("coupled");
    state = ticks(operate(state, deblockCommand()), 60);
    state = ticks(operate(state, powerOrderCommand(300)), 400);
    expect(state.simulation.station).toMatchObject({
      converter: "deblocked",
      powerMW: 300,
      udcKV: testConfig.ratedVoltageKV,
    });
    expect(state.simulation.station.relay86.locked).toBe(false);
    // La protección no volvió a actuar.
    expect(states(state, "PROT.CONVERTER")).toEqual(["picked-up", "operated"]);
  });

  test("con el 86 enclavado el operador no puede volver a cerrar Q1, aunque despeje la falla", () => {
    let state = ticks(provoke(start(), "transformer"), 1);
    state = operate(state, modeCommand("manual"));
    state = operate(state, switchCommand("Q2", "open"));
    state = ticks(clear(ticks(state, 50), "transformer"), 1);
    expect(deriveState(state.simulation.station.switchgear)).toBe("stopped");

    // Falta el reset: la selección se rechaza con el motivo del 86.
    state = run(state, { type: "select", command: switchCommand("Q1", "closed") });
    expect(state.ui.selection).toBeNull();
    expect(detailOf(state, "CMD.Q1_CLOSE")).toContain("relé 86 enclavado");

    // Con el reset, ya se puede.
    state = operate(state, reset86Command());
    state = run(state, { type: "select", command: switchCommand("Q1", "closed") });
    expect(state.ui.selection).not.toBeNull();
  });

  test("resetear sin 86 enclavado se rechaza con su motivo", () => {
    const state = run(start(), { type: "select", command: reset86Command() });
    expect(state.ui.selection).toBeNull();
    expect(detailOf(state, "CMD.RESET_86")).toContain("no está enclavado");
  });
});

// El panel lateral de eventos en el reducer: plegar, desplegar y contar los eventos nuevos.
import { describe, expect, test } from "vitest";
import { testConfig } from "../testSupport.ts";
import { transitionCommand } from "./commands.ts";
import { newEventsCount } from "./eventRows.ts";
import { createHmiState, hmiReducer, type HmiAction, type HmiState } from "./hmiState.ts";

const toggle: HmiAction = { type: "toggle-events-panel" };
const run = (state: HmiState, ...actions: HmiAction[]) => actions.reduce(hmiReducer, state);
const initial = () => createHmiState(testConfig);

// Cuenta como lo hace la pestaña: con lo que guarda el estado.
const newCount = (state: HmiState) =>
  newEventsCount(state.ui.eventsPanelOpen, state.simulation.nextEventId, state.ui.eventsFoldedAtId);

// Una orden rechazada al seleccionar deja un evento en el SER.
const rejectedSelect: HmiAction = { type: "select", command: transitionCommand("coupled") };

describe("reducer: panel de eventos", () => {
  test("visible por defecto", () => {
    expect(initial().ui.eventsPanelOpen).toBe(true);
  });

  test("el estado inicial puede arrancar plegado (preferencia guardada o pantalla angosta)", () => {
    const state = createHmiState(testConfig, undefined, undefined, 0, false);
    expect(state.ui.eventsPanelOpen).toBe(false);
  });

  test("el botón pliega y despliega", () => {
    const folded = run(initial(), toggle);
    expect(folded.ui.eventsPanelOpen).toBe(false);
    expect(run(folded, toggle).ui.eventsPanelOpen).toBe(true);
  });

  test("plegar y desplegar no cambia la simulación ni la selección", () => {
    const before = run(initial(), { type: "select", command: transitionCommand("decoupled") });
    const after = run(before, toggle, toggle);
    expect(after.simulation).toEqual(before.simulation);
    expect(after.ui.selection).toEqual(before.ui.selection);
  });

  test("plegado cuenta los eventos llegados desde que se plegó", () => {
    let state = run(initial(), rejectedSelect); // un evento antes de plegar: no cuenta
    state = run(state, toggle);
    expect(newCount(state)).toBe(0);

    state = run(state, rejectedSelect, rejectedSelect);
    expect(newCount(state)).toBe(2);
  });

  test("al desplegar el contador vuelve a cero, y al plegar de nuevo parte de cero", () => {
    let state = run(initial(), toggle, rejectedSelect);
    expect(newCount(state)).toBe(1);

    state = run(state, toggle); // desplegar
    expect(newCount(state)).toBe(0);

    state = run(state, rejectedSelect, toggle); // llegan eventos con el panel abierto y se pliega
    expect(newCount(state)).toBe(0);
    state = run(state, rejectedSelect);
    expect(newCount(state)).toBe(1);
  });

  test("navegar entre ventanas no cambia el panel", () => {
    const state = run(initial(), toggle, { type: "navigate", window: "events" });
    expect(state.ui.eventsPanelOpen).toBe(false);
  });
});

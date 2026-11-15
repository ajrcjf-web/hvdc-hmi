import { describe, expect, test } from "vitest";
import { stepSwitchgear, tripSwitch, type Switchgear } from "./switchgear.ts";
import { switchgearFor } from "./stationState.ts";

describe("tripSwitch: disparo de una protección", () => {
  test("abre un equipo cerrado, como una maniobra de apertura de tripSeconds", () => {
    const result = tripSwitch(switchgearFor("coupled"), "Q1", 0.03);
    expect(result.Q1).toEqual({ kind: "moving", to: "open", remainingSeconds: 0.03 });
    expect(result.Q2).toEqual({ kind: "closed" });
  });

  test("tiene prioridad sobre una maniobra de cierre en curso: pasa a abrirse", () => {
    const closing: Switchgear = {
      ...switchgearFor("stopped"),
      Q1: { kind: "moving", to: "closed", remainingSeconds: 1.5 },
    };
    expect(tripSwitch(closing, "Q1", 0.03).Q1).toEqual({
      kind: "moving",
      to: "open",
      remainingSeconds: 0.03,
    });
  });

  test("si ya está abierto, o ya se está abriendo, no cambia nada", () => {
    const stopped = switchgearFor("stopped");
    expect(tripSwitch(stopped, "Q1", 0.03)).toBe(stopped);
    const opening: Switchgear = {
      ...switchgearFor("decoupled"),
      Q1: { kind: "moving", to: "open", remainingSeconds: 0.5 },
    };
    expect(tripSwitch(opening, "Q1", 0.03)).toBe(opening);
  });

  test("con dt = 0.1 el disparo de 30 ms termina en un ciclo; con dt = 0.01 dura tres", () => {
    const tripped = tripSwitch(switchgearFor("coupled"), "Q1", 0.03);
    expect(stepSwitchgear(tripped, 0.1).Q1).toEqual({ kind: "open" });

    let fine = tripped;
    const states: string[] = [];
    for (let i = 0; i < 4; i++) {
      fine = stepSwitchgear(fine, 0.01);
      states.push(fine.Q1.kind);
    }
    expect(states).toEqual(["moving", "moving", "open", "open"]);
  });
});

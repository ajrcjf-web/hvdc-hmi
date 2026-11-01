import { describe, expect, test } from "vitest";
import {
  canTransition,
  deriveState,
  stationStates,
  switchgearFor,
  type StationState,
} from "./stationState.ts";
import type { Switchgear } from "./switchgear.ts";

describe("canTransition", () => {
  // Los 16 pares posibles: [desde, hacia, permitido]
  const cases: [StationState, StationState, boolean][] = [
    ["earthed", "earthed", false],
    ["earthed", "stopped", true],
    ["earthed", "decoupled", false],
    ["earthed", "coupled", false],

    ["stopped", "earthed", true],
    ["stopped", "stopped", false],
    ["stopped", "decoupled", true],
    ["stopped", "coupled", false],

    ["decoupled", "earthed", false],
    ["decoupled", "stopped", true],
    ["decoupled", "decoupled", false],
    ["decoupled", "coupled", true],

    ["coupled", "earthed", false],
    ["coupled", "stopped", false],
    ["coupled", "decoupled", true],
    ["coupled", "coupled", false],
  ];

  test.each(cases)("%s → %s: %s", (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  test("nunca permite poner a tierra una estación acoplada", () => {
    expect(canTransition("coupled", "earthed")).toBe(false);
  });
});

describe("deriveState", () => {
  test.each(stationStates)("reconoce las posiciones del estado %s", (state) => {
    expect(deriveState(switchgearFor(state))).toBe(state);
  });

  test("con un equipo en maniobra, la estación está en transición", () => {
    const switchgear: Switchgear = {
      Q1: { kind: "moving", to: "closed", remainingSeconds: 1 },
      Q2: { kind: "open" },
      QE: { kind: "open" },
    };
    expect(deriveState(switchgear)).toBe("transition");
  });

  test("posiciones que no corresponden a ningún estado son inconsistentes", () => {
    const switchgear: Switchgear = {
      Q1: { kind: "open" },
      Q2: { kind: "closed" },
      QE: { kind: "open" },
    };
    expect(deriveState(switchgear)).toBe("inconsistent");
  });
});

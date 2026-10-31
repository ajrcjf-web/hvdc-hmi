import { describe, expect, test } from "vitest";
import { canTransition, type StationState } from "./stationState.ts";

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

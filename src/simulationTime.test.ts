import { describe, expect, test } from "vitest";
import {
  hasReached,
  isTimeUp,
  TIME_TOLERANCE_SECONDS,
  wholeSecondsLeft,
} from "./simulationTime.ts";

// Restar dt muchas veces deja un residuo; sumarlo, un tiempo apenas menor.
function subtractTimes(from: number, dt: number, times: number): number {
  let value = from;
  for (let i = 0; i < times; i++) {
    value -= dt;
  }
  return value;
}

function addTimes(dt: number, times: number): number {
  let value = 0;
  for (let i = 0; i < times; i++) {
    value += dt;
  }
  return value;
}

describe("isTimeUp", () => {
  test("el residuo positivo de restar 0.1 diez veces a 1 cuenta como cumplido", () => {
    const residue = subtractTimes(1, 0.1, 10);
    expect(residue).toBeGreaterThan(0); // el caso que <= 0 no toleraba
    expect(isTimeUp(residue)).toBe(true);
  });

  test("cero y los negativos cuentan como cumplido", () => {
    expect(isTimeUp(0)).toBe(true);
    expect(isTimeUp(-0.1)).toBe(true);
  });

  test("lo que falta de verdad no cuenta como cumplido", () => {
    expect(isTimeUp(0.1)).toBe(false);
    expect(isTimeUp(subtractTimes(1, 0.1, 9))).toBe(false);
    expect(isTimeUp(TIME_TOLERANCE_SECONDS * 10)).toBe(false);
  });
});

describe("hasReached", () => {
  test("el tiempo acumulado apenas por debajo del objetivo cuenta como alcanzado", () => {
    const time = addTimes(0.1, 150);
    expect(time).toBeLessThan(15); // 14.99999999999996
    expect(hasReached(time, 15)).toBe(true);
  });

  test("el objetivo exacto y lo posterior cuentan como alcanzado", () => {
    expect(hasReached(15, 15)).toBe(true);
    expect(hasReached(15.1, 15)).toBe(true);
  });

  test("un latido antes todavía no se alcanzó", () => {
    expect(hasReached(addTimes(0.1, 149), 15)).toBe(false);
    expect(hasReached(14.9, 15)).toBe(false);
  });
});

describe("wholeSecondsLeft", () => {
  test("redondea hacia arriba", () => {
    expect(wholeSecondsLeft(5.2)).toBe(6);
    expect(wholeSecondsLeft(0.2)).toBe(1);
    expect(wholeSecondsLeft(15)).toBe(15);
  });

  test("no suma un segundo por el error de redondeo", () => {
    expect(wholeSecondsLeft(15 - addTimes(0.1, 100))).toBe(5); // 5.0000000000000195
    expect(wholeSecondsLeft(6.000000000000001)).toBe(6);
  });

  test("nunca baja de 0", () => {
    expect(wholeSecondsLeft(0)).toBe(0);
    expect(wholeSecondsLeft(-3)).toBe(0);
    expect(wholeSecondsLeft(subtractTimes(1, 0.1, 10))).toBe(0);
  });
});

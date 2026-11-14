import { describe, expect, test } from "vitest";
import { focusTarget } from "./focus.ts";

const element = (isConnected: boolean) => ({ isConnected });

describe("focusTarget", () => {
  test("vuelve al elemento que abrió la ventana si sigue en la página", () => {
    const opener = element(true);
    const fallback = element(true);
    expect(focusTarget(opener, fallback)).toBe(opener);
  });

  test("si el que abrió ya no está en la página, va al de reserva", () => {
    const fallback = element(true);
    expect(focusTarget(element(false), fallback)).toBe(fallback);
  });

  test("si no se sabe quién abrió la ventana, va al de reserva", () => {
    const fallback = element(true);
    expect(focusTarget(null, fallback)).toBe(fallback);
  });

  test("sin ninguno de los dos no hay a dónde ir", () => {
    expect(focusTarget(null, null)).toBeNull();
    expect(focusTarget(element(false), null)).toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { toSerRow } from "./serView.ts";

const at = new Date(2026, 10, 5, 14, 3, 7, 123).getTime();

describe("toSerRow", () => {
  test("la descripción y el estado salen de las tablas, no del evento", () => {
    const event: SerEvent = { id: 3, code: "Q1.POS", state: "closed", timestampMs: at };
    expect(toSerRow(event)).toEqual({
      id: 3,
      timestamp: "2026-11-05 14:03:07.123",
      description: "Q1 (interruptor AC): posición",
      state: "cerrado",
    });
  });

  test("la consigna muestra su valor en MW", () => {
    const event: SerEvent = {
      id: 0,
      code: "CMD.POWER_ORDER",
      state: "executed",
      timestampMs: at,
      valueMW: 300,
    };
    expect(toSerRow(event).description).toBe("Orden: consigna de potencia (300 MW)");
  });

  test("el rechazo muestra su motivo y lleva el símbolo ✗", () => {
    const event: SerEvent = {
      id: 0,
      code: "CMD.TO_COUPLED",
      state: "rejected",
      timestampMs: at,
      detail: "Q2 en maniobra",
    };
    const row = toSerRow(event);
    expect(row.description).toBe("Orden: ir a coupled — Q2 en maniobra");
    expect(row.state).toBe("✗ rechazada");
  });

  test("la fecha y hora usan el formato de labels", () => {
    const event: SerEvent = { id: 0, code: "STATION.STATE", state: "coupled", timestampMs: at };
    expect(toSerRow(event).timestamp).toBe(formatTimestamp(at));
  });
});

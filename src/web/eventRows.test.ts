import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { describeSignal } from "../signals.ts";
import {
  describeNewEvents,
  formatNewEventsCount,
  newEventsCount,
  PANEL_EVENT_LIMIT,
  toEventRows,
} from "./eventRows.ts";
import { toSerRow } from "./serView.ts";

const event = (id: number, overrides: Partial<SerEvent> = {}): SerEvent => ({
  id,
  code: "Q1.POS",
  state: "closed",
  timestampMs: Date.UTC(2026, 10, 5, 14, 3, 7, id),
  ...overrides,
});

describe("toEventRows", () => {
  test("sin eventos no hay filas", () => {
    expect(toEventRows([])).toEqual([]);
  });

  test("conserva el orden del SER (el más reciente primero)", () => {
    const events = [event(5), event(4), event(3), event(2), event(1)];
    expect(toEventRows(events).map((row) => row.id)).toEqual([5, 4, 3, 2, 1]);
  });

  test("dibuja como mucho PANEL_EVENT_LIMIT eventos, los más recientes", () => {
    const events = Array.from({ length: 120 }, (_, i) => event(120 - i)); // 120 ... 1
    const rows = toEventRows(events);
    expect(PANEL_EVENT_LIMIT).toBe(50);
    expect(rows).toHaveLength(50);
    expect(rows[0]?.id).toBe(120);
    expect(rows[49]?.id).toBe(71);
  });

  test("con pocos eventos devuelve solo los que hay", () => {
    expect(toEventRows([event(2), event(1)])).toHaveLength(2);
  });

  test("la hora, la descripción y el estado son los del SER, sin textos propios", () => {
    const e = event(7);
    const [row] = toEventRows([e]);
    const ser = toSerRow(e);
    expect(row?.timestamp).toBe(ser.timestamp);
    expect(row?.timestamp).toBe(formatTimestamp(e.timestampMs));
    expect(row?.description).toBe(describeSignal("Q1.POS"));
    expect(row?.state).toBe(ser.state);
    // El tooltip es la fila completa, en el orden del SER: hora · descripción · estado.
    expect(row?.tooltip).toBe(`${ser.timestamp} ${row?.description} · ${row?.state}`);
  });

  test("el estado va aparte de la descripción: lo que se corta con '…' es la descripción", () => {
    const [row] = toEventRows([event(1, { code: "ALARM.INCONSISTENT", state: "returned-unacknowledged" })]);
    expect(row?.state).toBe("normalizada sin reconocer");
    expect(row?.description).not.toContain("normalizada");
  });

  test("un rechazo lleva ✗ al principio de la descripción y el motivo, y se marca como rechazado", () => {
    const [row] = toEventRows([
      event(1, { code: "CMD.Q2_CLOSE", state: "rejected", detail: "Q1 sin cerrar" }),
    ]);
    expect(row?.rejected).toBe(true);
    expect(row?.description.startsWith("✗ ")).toBe(true); // al principio: no se pierde si se corta
    expect(row?.description).toContain("Q1 sin cerrar");
    expect(row?.state).toBe("rechazada"); // el ✗ no se repite en el estado
    expect(row?.alarm).toBeNull();
  });

  test("un evento de alarma lleva el símbolo de su prioridad al principio de la descripción", () => {
    const [urgent] = toEventRows([
      event(1, { code: "ALARM.INCONSISTENT", state: "active-unacknowledged" }),
    ]);
    expect(urgent).toMatchObject({ alarm: "urgent", active: true, rejected: false });
    expect(urgent?.description.startsWith("!!! ")).toBe(true);
    expect(urgent?.state).toBe("activa sin reconocer");

    const [high] = toEventRows([event(2, { code: "ALARM.TEST_HIGH", state: "active-unacknowledged" })]);
    expect(high?.description.startsWith("!! ")).toBe(true);
    const [low] = toEventRows([event(3, { code: "ALARM.TEST_LOW", state: "active-unacknowledged" })]);
    expect(low?.description.startsWith("! ")).toBe(true);
  });

  test("la alarma que pasó a normal deja de estar activa", () => {
    const [row] = toEventRows([event(1, { code: "ALARM.INCONSISTENT", state: "normal" })]);
    expect(row).toMatchObject({ alarm: "urgent", active: false });
  });

  test("un evento que no es de alarma no tiene prioridad", () => {
    expect(toEventRows([event(1)])[0]).toMatchObject({ alarm: null, active: false });
  });
});

describe("eventos nuevos de la pestaña", () => {
  test("con el panel abierto no hay eventos nuevos", () => {
    expect(newEventsCount(true, 40, 10)).toBe(0);
  });

  test("plegado cuenta los eventos llegados desde que se plegó", () => {
    expect(newEventsCount(false, 10, 10)).toBe(0);
    expect(newEventsCount(false, 13, 10)).toBe(3);
  });

  test("nunca da un valor negativo", () => {
    expect(newEventsCount(false, 5, 10)).toBe(0);
  });

  test("la etiqueta accesible de la pestaña: singular para 1 y plural para el resto", () => {
    expect(describeNewEvents(0)).toBe("");
    expect(describeNewEvents(1)).toBe("1 nuevo");
    expect(describeNewEvents(2)).toBe("2 nuevos");
    expect(describeNewEvents(100)).toBe("99+ nuevos");
  });

  test("el texto del contador: vacío en 0 y tope 99+", () => {
    expect(formatNewEventsCount(0)).toBe("");
    expect(formatNewEventsCount(1)).toBe("1");
    expect(formatNewEventsCount(99)).toBe("99");
    expect(formatNewEventsCount(100)).toBe("99+");
  });
});

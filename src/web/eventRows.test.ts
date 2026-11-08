import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { describeSignal } from "../signals.ts";
import {
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

  test("la hora y los textos son los del SER, sin textos propios", () => {
    const e = event(7);
    const [row] = toEventRows([e]);
    const ser = toSerRow(e);
    expect(row?.timestamp).toBe(ser.timestamp);
    expect(row?.timestamp).toBe(formatTimestamp(e.timestampMs));
    // Mismo orden que el SER: hora · descripción · estado.
    expect(row?.text).toBe(`${describeSignal("Q1.POS")} · ${ser.state}`);
    expect(row?.tooltip).toBe(`${ser.timestamp} ${row?.text}`);
  });

  test("un rechazo lleva ✗ y el motivo, y se marca como rechazado", () => {
    const [row] = toEventRows([
      event(1, { code: "CMD.Q2_CLOSE", state: "rejected", detail: "Q1 sin cerrar" }),
    ]);
    expect(row?.rejected).toBe(true);
    expect(row?.text.startsWith("✗ ")).toBe(true); // al principio: no se pierde si el texto se corta
    expect(row?.text.match(/✗/g)).toHaveLength(1); // y no se repite en el estado
    expect(row?.text).toContain("Q1 sin cerrar");
    expect(row?.text.endsWith(" · rechazada")).toBe(true);
    expect(row?.alarm).toBeNull();
  });

  test("el orden de los campos es el del SER: descripción, luego estado", () => {
    const [row] = toEventRows([event(1, { code: "ALARM.INCONSISTENT", state: "active-unacknowledged" })]);
    const text = row?.text ?? "";
    expect(text.indexOf("Alarma: estación inconsistente")).toBeLessThan(text.indexOf("activa sin reconocer"));
  });

  test("un evento de alarma lleva el símbolo de su prioridad", () => {
    const [urgent] = toEventRows([
      event(1, { code: "ALARM.INCONSISTENT", state: "active-unacknowledged" }),
    ]);
    expect(urgent).toMatchObject({ alarm: "urgent", active: true, rejected: false });
    expect(urgent?.text.startsWith("!!! ")).toBe(true);

    const [high] = toEventRows([event(2, { code: "ALARM.TEST_HIGH", state: "active-unacknowledged" })]);
    expect(high?.text.startsWith("!! ")).toBe(true);
    const [low] = toEventRows([event(3, { code: "ALARM.TEST_LOW", state: "active-unacknowledged" })]);
    expect(low?.text.startsWith("! ")).toBe(true);
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

  test("el texto del contador: vacío en 0 y tope 99+", () => {
    expect(formatNewEventsCount(0)).toBe("");
    expect(formatNewEventsCount(1)).toBe("1");
    expect(formatNewEventsCount(99)).toBe("99");
    expect(formatNewEventsCount(100)).toBe("99+");
  });
});

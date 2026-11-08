import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { describeSignal } from "../signals.ts";
import { MESSAGE_ROWS, toMessageRows } from "./messageRows.ts";
import { toSerRow } from "./serView.ts";

const event = (id: number, overrides: Partial<SerEvent> = {}): SerEvent => ({
  id,
  code: "Q1.POS",
  state: "closed",
  timestampMs: Date.UTC(2026, 10, 5, 14, 3, 7, id),
  ...overrides,
});

describe("toMessageRows", () => {
  test("sin eventos no hay filas", () => {
    expect(toMessageRows([])).toEqual([]);
  });

  test("muestra como mucho 3 eventos, en el orden del SER (el más reciente primero)", () => {
    const events = [event(5), event(4), event(3), event(2), event(1)];
    expect(MESSAGE_ROWS).toBe(3);
    expect(toMessageRows(events).map((row) => row.id)).toEqual([5, 4, 3]);
  });

  test("con menos eventos que filas devuelve solo los que hay", () => {
    expect(toMessageRows([event(2), event(1)])).toHaveLength(2);
  });

  test("la hora y los textos son los del SER, sin textos propios", () => {
    const e = event(7);
    const [row] = toMessageRows([e]);
    const ser = toSerRow(e);
    expect(row?.timestamp).toBe(ser.timestamp);
    expect(row?.timestamp).toBe(formatTimestamp(e.timestampMs));
    // Mismo orden que el SER: hora · descripción · estado.
    expect(row?.text).toBe(`${describeSignal("Q1.POS")} · ${ser.state}`);
    expect(row?.tooltip).toBe(`${ser.timestamp} ${row?.text}`);
  });

  test("un rechazo lleva ✗ y el motivo, y se marca como rechazado", () => {
    const [row] = toMessageRows([
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
    const [row] = toMessageRows([event(1, { code: "ALARM.INCONSISTENT", state: "active-unacknowledged" })]);
    const text = row?.text ?? "";
    expect(text.indexOf("Alarma: estación inconsistente")).toBeLessThan(text.indexOf("activa sin reconocer"));
  });

  test("un evento de alarma lleva el símbolo de su prioridad", () => {
    const [urgent] = toMessageRows([
      event(1, { code: "ALARM.INCONSISTENT", state: "active-unacknowledged" }),
    ]);
    expect(urgent).toMatchObject({ alarm: "urgent", active: true, rejected: false });
    expect(urgent?.text.startsWith("!!! ")).toBe(true);

    const [high] = toMessageRows([event(2, { code: "ALARM.TEST_HIGH", state: "active-unacknowledged" })]);
    expect(high?.text.startsWith("!! ")).toBe(true);
    const [low] = toMessageRows([event(3, { code: "ALARM.TEST_LOW", state: "active-unacknowledged" })]);
    expect(low?.text.startsWith("! ")).toBe(true);
  });

  test("la alarma que pasó a normal deja de estar activa", () => {
    const [row] = toMessageRows([event(1, { code: "ALARM.INCONSISTENT", state: "normal" })]);
    expect(row).toMatchObject({ alarm: "urgent", active: false });
  });

  test("un evento que no es de alarma no tiene prioridad", () => {
    expect(toMessageRows([event(1)])[0]).toMatchObject({ alarm: null, active: false });
  });
});

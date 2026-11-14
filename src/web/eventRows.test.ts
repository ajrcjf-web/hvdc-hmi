import { describe, expect, test } from "vitest";
import type { SerEvent } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { describeSignal } from "../signals.ts";
import {
  describeNewEvents,
  describeNewEventsSummary,
  formatNewEventsCount,
  newEventsCount,
  PANEL_EVENT_LIMIT,
  summarizeNewEvents,
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

describe("summarizeNewEvents: lo que marca la pestaña plegada", () => {
  // El SER guarda el más reciente primero; `foldedAtId` es el nextEventId al plegar.
  const alarmEvent = (id: number, code: SerEvent["code"], state: SerEvent["state"]) =>
    event(id, { code, state });

  test("con el panel abierto no marca nada", () => {
    const events = [event(5, { state: "rejected" }), event(4)];
    expect(summarizeNewEvents(true, events, 6, 0)).toEqual({ count: 0, rejected: false, alarm: null });
  });

  test("sin eventos nuevos no marca nada", () => {
    const events = [event(2, { state: "rejected" }), event(1)];
    expect(summarizeNewEvents(false, events, 3, 3)).toEqual({ count: 0, rejected: false, alarm: null });
  });

  test("solo eventos normales: cuenta, pero sin marcas", () => {
    const events = [event(4), event(3), event(2, { state: "rejected" }), event(1)];
    // Se plegó con 3 eventos (ids 0, 1, 2): solo los ids 3 y 4 son nuevos.
    expect(summarizeNewEvents(false, events, 5, 3)).toEqual({ count: 2, rejected: false, alarm: null });
  });

  test("un rechazo nuevo marca ✗", () => {
    const events = [event(4, { code: "CMD.Q2_CLOSE", state: "rejected" }), event(3)];
    expect(summarizeNewEvents(false, events, 5, 3)).toEqual({ count: 2, rejected: true, alarm: null });
  });

  test("un rechazo anterior al plegado no cuenta", () => {
    const events = [event(3), event(2, { state: "rejected" })];
    expect(summarizeNewEvents(false, events, 4, 3)).toMatchObject({ count: 1, rejected: false });
  });

  test("una alarma que aparece marca la prioridad", () => {
    const events = [alarmEvent(3, "ALARM.INCONSISTENT", "active-unacknowledged")];
    expect(summarizeNewEvents(false, events, 4, 3)).toMatchObject({ alarm: "urgent" });
    expect(
      summarizeNewEvents(false, [alarmEvent(3, "ALARM.TEST_LOW", "active-unacknowledged")], 4, 3),
    ).toMatchObject({ alarm: "low" });
  });

  test("con varias alarmas marca la prioridad más alta", () => {
    const events = [
      alarmEvent(5, "ALARM.TEST_LOW", "active-unacknowledged"),
      alarmEvent(4, "ALARM.TEST_HIGH", "active-unacknowledged"),
      alarmEvent(3, "ALARM.TEST_LOW", "active-unacknowledged"),
    ];
    expect(summarizeNewEvents(false, events, 6, 3)).toMatchObject({ alarm: "high" });
  });

  test("normalizar o reconocer una alarma no cuenta como alarma nueva", () => {
    const events = [
      alarmEvent(5, "ALARM.INCONSISTENT", "normal"),
      alarmEvent(4, "ALARM.INCONSISTENT", "active-acknowledged"),
      alarmEvent(3, "ALARM.INCONSISTENT", "returned-unacknowledged"),
    ];
    expect(summarizeNewEvents(false, events, 6, 3)).toMatchObject({ count: 3, alarm: null });
  });

  test("rechazo y alarma a la vez: marca las dos", () => {
    const events = [
      alarmEvent(4, "ALARM.TEST_URGENT", "active-unacknowledged"),
      event(3, { code: "CMD.Q1_CLOSE", state: "rejected" }),
    ];
    expect(summarizeNewEvents(false, events, 5, 3)).toEqual({ count: 2, rejected: true, alarm: "urgent" });
  });

  test("si hay más eventos nuevos de los que guarda el SER, la cantidad sigue contando todos", () => {
    const events = [event(1999)]; // el SER ya descartó los más viejos
    expect(summarizeNewEvents(false, events, 2000, 0).count).toBe(2000);
  });
});

describe("describeNewEventsSummary: la etiqueta accesible de la pestaña", () => {
  test("sin eventos nuevos queda vacía", () => {
    expect(describeNewEventsSummary({ count: 0, rejected: false, alarm: null })).toBe("");
  });

  test("solo la cantidad", () => {
    expect(describeNewEventsSummary({ count: 1, rejected: false, alarm: null })).toBe("1 nuevo");
    expect(describeNewEventsSummary({ count: 3, rejected: false, alarm: null })).toBe("3 nuevos");
  });

  test("con rechazo y con alarma, dicho con palabras", () => {
    expect(describeNewEventsSummary({ count: 3, rejected: true, alarm: null })).toBe(
      "3 nuevos, con rechazo",
    );
    expect(describeNewEventsSummary({ count: 2, rejected: false, alarm: "urgent" })).toBe(
      "2 nuevos, con alarma urgente",
    );
    expect(describeNewEventsSummary({ count: 5, rejected: true, alarm: "high" })).toBe(
      "5 nuevos, con rechazo, con alarma alta",
    );
    expect(describeNewEventsSummary({ count: 5, rejected: false, alarm: "low" })).toBe(
      "5 nuevos, con alarma baja",
    );
  });
});

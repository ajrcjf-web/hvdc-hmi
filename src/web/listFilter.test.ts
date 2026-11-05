import { describe, expect, test } from "vitest";
import { filterRows, normalizeText } from "./listFilter.ts";

type Row = { time: string; description: string; state: string };

const rows: Row[] = [
  { time: "2026-11-05 10:00:00.000", description: "Q1 (interruptor AC): posición", state: "cerrado" },
  { time: "2026-11-05 10:00:01.500", description: "Q2 (seccionador DC): posición", state: "en maniobra" },
  { time: "2026-11-05 10:00:02.000", description: "Orden: bloquear el convertidor", state: "ejecutada" },
  { time: "2026-11-06 09:30:00.000", description: "Orden: ir a coupled", state: "✗ rechazada" },
];

describe("normalizeText", () => {
  test("quita mayúsculas y acentos", () => {
    expect(normalizeText("POSICIÓN")).toBe("posicion");
    expect(normalizeText("Maniobra")).toBe("maniobra");
    expect(normalizeText("Señal")).toBe("senal");
  });
});

describe("filterRows", () => {
  test("sin filtros, o con filtros vacíos, deja pasar todo", () => {
    expect(filterRows(rows, {})).toEqual(rows);
    expect(filterRows(rows, { time: "", description: "", state: "" })).toEqual(rows);
  });

  test("filtra por 'contiene', en cualquier parte del texto", () => {
    expect(filterRows(rows, { description: "seccionador" })).toEqual([rows[1]]);
    expect(filterRows(rows, { state: "ada" })).toEqual([rows[2], rows[3]]);
  });

  test("no distingue mayúsculas", () => {
    expect(filterRows(rows, { description: "ORDEN" })).toEqual([rows[2], rows[3]]);
    expect(filterRows(rows, { description: "q1" })).toEqual([rows[0]]);
  });

  test("no distingue acentos: con o sin acento da lo mismo", () => {
    expect(filterRows(rows, { description: "posicion" })).toEqual([rows[0], rows[1]]);
    expect(filterRows(rows, { description: "posición" })).toEqual([rows[0], rows[1]]);
    expect(filterRows(rows, { description: "POSICIÓN" })).toEqual([rows[0], rows[1]]);
  });

  test("también funciona con acentos en el texto de la fila y no en el filtro", () => {
    expect(filterRows(rows, { description: "convertidor" })).toEqual([rows[2]]);
    expect(filterRows([{ ...rows[0]!, description: "Señal" }], { description: "senal" })).toHaveLength(1);
  });

  test("los filtros de varias columnas se combinan (todos deben cumplirse)", () => {
    expect(filterRows(rows, { description: "orden", state: "rechazada" })).toEqual([rows[3]]);
    expect(filterRows(rows, { description: "q1", state: "rechazada" })).toEqual([]);
  });

  test("filtra por la fecha y hora tal como se ve", () => {
    expect(filterRows(rows, { time: "11-06" })).toEqual([rows[3]]);
    expect(filterRows(rows, { time: "10:00:01" })).toEqual([rows[1]]);
  });

  test("sin coincidencias devuelve una lista vacía", () => {
    expect(filterRows(rows, { description: "no existe" })).toEqual([]);
  });

  test("conserva el orden de las filas y no modifica la lista recibida", () => {
    const copy = structuredClone(rows);
    const result = filterRows(rows, { state: "a" });
    expect(result.map((r) => r.time)).toEqual([...result.map((r) => r.time)].sort());
    expect(rows).toEqual(copy);
  });
});

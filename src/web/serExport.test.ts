import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../labels.ts";
import { describeFilters, escapeCsvField, exportFileName, toCsv } from "./serExport.ts";
import type { SerRow } from "./serView.ts";

const titles: [string, string, string] = ["Fecha y hora", "Descripción", "Estado"];
const row = (description: string, state = "Ejecutada"): SerRow => ({
  id: 1,
  timestamp: "2026-11-05 14:03:07.123",
  description,
  state,
});

describe("escapeCsvField", () => {
  it("deja igual un texto simple", () => {
    expect(escapeCsvField("Q2 cerrado")).toBe("Q2 cerrado");
  });

  it("encierra entre comillas lo que lleva punto y coma", () => {
    expect(escapeCsvField("a;b")).toBe('"a;b"');
  });

  it("duplica las comillas internas", () => {
    expect(escapeCsvField('dice "hola"')).toBe('"dice ""hola"""');
  });

  it("encierra entre comillas los saltos de línea", () => {
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });

  it("la coma ya no es separador: no obliga a poner comillas", () => {
    expect(escapeCsvField("1,5 MW")).toBe("1,5 MW");
  });
});

describe("toCsv", () => {
  it("separa las columnas con punto y coma", () => {
    const lines = toCsv([row("Q2 cerrado")], titles).split("\r\n");
    expect(lines[0]).toBe("﻿Fecha y hora;Descripción;Estado");
    expect(lines[1]).toBe("2026-11-05 14:03:07.123;Q2 cerrado;Ejecutada");
  });

  it("empieza con el BOM UTF-8 y conserva acentos y símbolos", () => {
    const csv = toCsv([row("Orden — motivo", "✗ Rechazada")], titles);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Orden — motivo;✗ Rechazada");
  });

  it("escapa los campos con punto y coma o comillas", () => {
    const csv = toCsv([row('P debe ser 0; "ver" manual')], titles);
    expect(csv).toContain('"P debe ser 0; ""ver"" manual"');
  });

  it("mantiene el orden de las filas", () => {
    const rows = [row("primero"), row("segundo")];
    const lines = toCsv(rows, titles).split("\r\n");
    expect(lines[1]).toContain("primero");
    expect(lines[2]).toContain("segundo");
  });

  it("sin filas deja solo la cabecera", () => {
    expect(toCsv([], titles)).toBe("﻿Fecha y hora;Descripción;Estado\r\n");
  });
});

describe("exportFileName", () => {
  it("lleva la fecha y hora, rellenando con ceros", () => {
    const ms = new Date(2026, 0, 2, 3, 4, 5, 6).getTime();
    expect(exportFileName("csv", ms)).toBe("SER_2026-01-02_03-04-05.csv");
    expect(formatTimestamp(ms)).toContain("2026-01-02 03:04:05");
  });

  it("no tiene dos puntos ni espacios", () => {
    expect(exportFileName("pdf", Date.now())).toMatch(/^SER_[\d-]+_[\d-]+\.pdf$/);
  });
});

describe("describeFilters", () => {
  const names = { timestamp: "Fecha y hora", description: "Descripción", state: "Estado" };

  it("sin filtros", () => {
    expect(describeFilters({ timestamp: "", description: "", state: "" }, names)).toBe("sin filtros");
  });

  it("lista solo los filtros con texto", () => {
    expect(
      describeFilters({ timestamp: "", description: "Q2", state: "rechaz" }, names),
    ).toBe("Descripción contiene «Q2»; Estado contiene «rechaz»");
  });
});

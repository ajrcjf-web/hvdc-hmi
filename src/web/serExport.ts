// Exportación del SER: funciones puras que preparan el texto del CSV, el nombre del
// archivo y la descripción de los filtros. Descargar y imprimir (efectos del navegador)
// viven en el componente.

import type { SerRow } from "./serView.ts";

// Punto y coma, no coma: en la configuración regional alemana y en muchas europeas la
// coma es el separador decimal, y Excel espera punto y coma (con comas mostraría todo
// en una sola columna).
export const CSV_SEPARATOR = ";";

// Marca de orden de bytes UTF-8: sin ella Excel abre el archivo con otra codificación
// y los acentos y símbolos (✗, —) salen rotos.
const BOM = "﻿";

// Un campo se encierra entre comillas si contiene el separador, comillas o saltos de
// línea; las comillas internas se duplican ("" es una comilla dentro del campo).
export function escapeCsvField(field: string): string {
  if (/[;"\r\n]/.test(field)) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

// Las columnas son las de la tabla, en el mismo orden. Recibe las filas visibles
// (con los filtros aplicados) y devuelve el texto completo del archivo.
export function toCsv(rows: SerRow[], titles: [string, string, string]): string {
  const lines = [
    titles,
    ...rows.map((row) => [row.timestamp, row.description, row.state]),
  ].map((fields) => fields.map(escapeCsvField).join(CSV_SEPARATOR));
  return BOM + lines.join("\r\n") + "\r\n";
}

const pad = (value: number) => String(value).padStart(2, "0");

// Nombre con la fecha y hora simulada, sin ":" ni espacios (válido en Windows):
// "SER_2026-11-05_14-03-07.csv".
export function exportFileName(extension: string, timestampMs: number): string {
  const d = new Date(timestampMs);
  return (
    `SER_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.${extension}`
  );
}

// Los filtros aplicados, para el encabezado del PDF: "Descripción contiene «Q2»; ..."
// o "sin filtros". Un filtro vacío no cuenta.
export function describeFilters(
  filters: Record<string, string>,
  titles: Record<string, string>,
): string {
  const applied = Object.entries(filters)
    .filter(([, text]) => text !== "")
    .map(([column, text]) => `${titles[column] ?? column} contiene «${text}»`);
  return applied.length === 0 ? "sin filtros" : applied.join("; ");
}

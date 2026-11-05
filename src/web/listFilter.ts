// Filtro de las listas tipo planilla (eventos y, más adelante, alarmas): una caja de
// filtro por columna, que filtra al escribir. Función pura; los componentes solo dibujan.
//
// Criterio: la columna "contiene" el texto, sin distinguir mayúsculas ni acentos.
// Los filtros de varias columnas se combinan: la fila debe cumplirlos todos.

// Quita mayúsculas y acentos: "Maniobra" y "MANIOBRÁ" se comparan como "maniobra".
// normalize("NFD") separa cada letra de su acento, y luego se borran los acentos.
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// filters trae, por columna, el texto escrito en su caja. Una columna sin filtro,
// o con el texto vacío, deja pasar todas las filas.
export function filterRows<Row extends object>(
  rows: Row[],
  filters: Partial<Record<keyof Row, string>>,
): Row[] {
  const active = (Object.entries(filters) as [keyof Row, string | undefined][])
    .filter(([, text]) => text !== undefined && text !== "")
    .map(([column, text]) => [column, normalizeText(text!)] as const);

  if (active.length === 0) {
    return rows;
  }
  return rows.filter((row) =>
    active.every(([column, text]) => normalizeText(String(row[column])).includes(text)),
  );
}

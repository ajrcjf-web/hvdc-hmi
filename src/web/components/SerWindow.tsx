// La ventana SER (registro secuencial de eventos): una tabla con tres columnas y,
// en la primera fila, una caja de filtro por columna que filtra al escribir.
// Los filtros viven aquí (son de la vista): se pierden al cambiar de ventana.
import { useState } from "react";
import { flushSync } from "react-dom";
import type { SerEvent } from "../../events.ts";
import { formatTimestamp } from "../../labels.ts";
import { MAX_EVENTS } from "../../simulationState.ts";
import { filterRows } from "../listFilter.ts";
import { describeFilters, exportFileName, toCsv } from "../serExport.ts";
import { toSerRows, type SerRow } from "../serView.ts";

type Props = {
  events: SerEvent[];
  discarded: number; // eventos que ya no caben (se descartaron los más viejos)
  nowMs: number; // hora simulada actual: nombre del archivo y encabezado del PDF
};

type Column = "timestamp" | "description" | "state";

const columns: { key: Column; title: string }[] = [
  { key: "timestamp", title: "Fecha y hora" },
  { key: "description", title: "Descripción" },
  { key: "state", title: "Estado" },
];

// Descarga un texto como archivo: crea un enlace temporal y lo "pulsa".
function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function SerWindow({ events, discarded, nowMs }: Props) {
  // Instante de la última exportación a PDF: el encabezado de la impresión no debe
  // cambiar con cada latido del reloj.
  const [exportedAtMs, setExportedAtMs] = useState(nowMs);
  const [filters, setFilters] = useState<Record<Column, string>>({
    timestamp: "",
    description: "",
    state: "",
  });

  const rows = toSerRows(events);
  const visible = filterRows<SerRow>(rows, filters);

  const titles = Object.fromEntries(columns.map((c) => [c.key, c.title]));

  const exportCsv = () => {
    const csv = toCsv(visible, [columns[0]!.title, columns[1]!.title, columns[2]!.title]);
    downloadText(csv, exportFileName("csv", nowMs));
  };

  // El PDF usa la impresión del navegador (el usuario elige "Guardar como PDF"). El
  // título de la página es el nombre de archivo que propone el navegador.
  const exportPdf = () => {
    flushSync(() => setExportedAtMs(nowMs)); // fija el encabezado antes de imprimir
    const previousTitle = document.title;
    document.title = exportFileName("pdf", nowMs).replace(/\.pdf$/, "");
    window.addEventListener("afterprint", () => (document.title = previousTitle), { once: true });
    window.print();
  };

  return (
    <section className="panel ser-window">
      <header className="print-header">
        <h1>Registro secuencial de eventos (SER)</h1>
        <p>Exportado: {formatTimestamp(exportedAtMs)}</p>
        <p>Filtros: {describeFilters(filters, titles)}</p>
        <p>
          {visible.length} de {rows.length} eventos
        </p>
      </header>
      <h1 className="screen-only">Eventos (SER)</h1>
      <div className="ser-actions">
        <button type="button" onClick={exportCsv} disabled={visible.length === 0}>
          Exportar CSV
        </button>
        <button type="button" onClick={exportPdf} disabled={visible.length === 0}>
          Exportar PDF
        </button>
      </div>
      <p className="empty screen-only">
        Mostrando {visible.length} de {rows.length} eventos
        {discarded > 0 && ` (se descartaron ${discarded} más viejos: el SER guarda los últimos ${MAX_EVENTS})`}
        . El más reciente va primero.
      </p>
      <div className="ser-scroll">
        <table className="ser">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.title}
                </th>
              ))}
            </tr>
            <tr className="ser-filters">
              {columns.map((c) => (
                <th key={c.key}>
                  <input
                    type="search"
                    value={filters[c.key]}
                    placeholder="Filtrar…"
                    aria-label={`Filtrar por ${c.title.toLowerCase()}`}
                    onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className={row.state.startsWith("✗") ? "rejected" : undefined}>
                <td className="ser-time">{row.timestamp}</td>
                <td>{row.description}</td>
                <td>{row.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="empty">
            {rows.length === 0 ? "Aún no hay eventos." : "Ningún evento coincide con los filtros."}
          </p>
        )}
      </div>
    </section>
  );
}

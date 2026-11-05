// La ventana SER (registro secuencial de eventos): una tabla con tres columnas y,
// en la primera fila, una caja de filtro por columna que filtra al escribir.
// Los filtros viven aquí (son de la vista): se pierden al cambiar de ventana.
import { useState } from "react";
import type { SerEvent } from "../../events.ts";
import { MAX_EVENTS } from "../hmiState.ts";
import { filterRows } from "../listFilter.ts";
import { toSerRows, type SerRow } from "../serView.ts";

type Props = {
  events: SerEvent[];
  discarded: number; // eventos que ya no caben (se descartaron los más viejos)
};

type Column = "timestamp" | "description" | "state";

const columns: { key: Column; title: string }[] = [
  { key: "timestamp", title: "Fecha y hora" },
  { key: "description", title: "Descripción" },
  { key: "state", title: "Estado" },
];

export function SerWindow({ events, discarded }: Props) {
  const [filters, setFilters] = useState<Record<Column, string>>({
    timestamp: "",
    description: "",
    state: "",
  });

  const rows = toSerRows(events);
  const visible = filterRows<SerRow>(rows, filters);

  return (
    <section className="panel">
      <h1>Eventos (SER)</h1>
      <p className="empty">
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

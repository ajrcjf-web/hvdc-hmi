// La ventana de alarmas: una planilla como el SER, con una caja de filtro por columna.
// Muestra solo las alarmas activas o sin reconocer. Reconocer es decir "la vi": no borra
// la alarma y no es una orden de mando (no hay confirmación). "Reconocer todas" actúa solo
// sobre las filas que se ven con los filtros aplicados.
// Los filtros viven aquí (son de la vista): se pierden al cambiar de ventana.
import { useState, type Dispatch } from "react";
import type { AlarmState } from "../../alarms.ts";
import { toAlarmRows, type AlarmRow } from "../alarmView.ts";
import type { HmiAction } from "../hmiState.ts";
import { filterRows } from "../listFilter.ts";

type Props = {
  alarms: AlarmState;
  startMs: number;
  dispatch: Dispatch<HmiAction>;
};

type Column = "timestamp" | "priority" | "description" | "state";

const columns: { key: Column; title: string }[] = [
  { key: "timestamp", title: "Fecha y hora" },
  { key: "priority", title: "Prioridad" },
  { key: "description", title: "Descripción" },
  { key: "state", title: "Estado" },
];

export function AlarmWindow({ alarms, startMs, dispatch }: Props) {
  const [filters, setFilters] = useState<Record<Column, string>>({
    timestamp: "",
    priority: "",
    description: "",
    state: "",
  });

  const rows = toAlarmRows(alarms, startMs);
  const visible = filterRows<AlarmRow>(rows, filters);
  const toAcknowledge = visible.filter((row) => row.unacknowledged).length;

  return (
    <section className="panel">
      <h1>Alarmas</h1>
      <p className="empty">
        Mostrando {visible.length} de {rows.length} alarmas activas o sin reconocer. La más urgente
        va primero.
      </p>
      <div className="buttons">
        <button
          type="button"
          disabled={toAcknowledge === 0}
          onClick={() =>
            dispatch({ type: "acknowledge-alarms", codes: visible.map((row) => row.code) })
          }
        >
          Reconocer todas las visibles ({toAcknowledge})
        </button>
      </div>
      <div className="ser-scroll">
        <table className="ser alarms">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.title}
                </th>
              ))}
              <th scope="col">Reconocer</th>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.code}
                className={`alarm-${row.level}${row.unacknowledged ? " alarm-unacknowledged" : ""}`}
              >
                <td className="ser-time">{row.timestamp}</td>
                <td className="alarm-priority">{row.priority}</td>
                <td>{row.description}</td>
                <td className="alarm-state">{row.state}</td>
                <td>
                  <button
                    type="button"
                    disabled={!row.unacknowledged}
                    onClick={() => dispatch({ type: "acknowledge-alarm", code: row.code })}
                  >
                    Reconocer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="empty">
            {rows.length === 0
              ? "No hay alarmas activas ni sin reconocer."
              : "Ninguna alarma coincide con los filtros."}
          </p>
        )}
      </div>
    </section>
  );
}

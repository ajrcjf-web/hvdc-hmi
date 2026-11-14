// El panel lateral de eventos: los últimos eventos del SER, del más reciente al más viejo,
// siempre visible en todas las ventanas. Solo muestra: los textos y las marcas de la
// pestaña los preparan toEventRows y summarizeNewEvents.
// Plegado queda una pestaña angosta en el borde derecho, con el contador de eventos nuevos y,
// para que no se pierda el aviso, una marca si llegó un rechazo (✗) o una alarma (!!!, !!, !).
// Cada evento ocupa dos líneas. Línea 1: la hora y, a la derecha, el estado, que es lo más
// importante y no se corta. Línea 2: la descripción, que si no cabe se corta con puntos
// suspensivos (el texto completo queda como tooltip). El panel tiene tamaño fijo: la
// llegada de un evento no mueve el contenido.
import {
  describeNewEventsSummary,
  formatNewEventsCount,
  prioritySymbol,
  type EventRow,
  type NewEventsSummary,
} from "../eventRows.ts";

type Props = {
  open: boolean;
  rows: EventRow[];
  summary: NewEventsSummary; // lo que llegó desde que se plegó
  onToggle: () => void; // plegar o desplegar
  onOpenSer: () => void; // abre la ventana del SER
};

function itemClass(row: EventRow): string {
  const classes = ["event-item"];
  if (row.rejected) classes.push("rejected");
  if (row.alarm !== null) classes.push("event-alarm", `alarm-${row.alarm}`);
  if (row.active) classes.push("event-alarm-active");
  return classes.join(" ");
}

export function EventsPanel({ open, rows, summary, onToggle, onOpenSer }: Props) {
  if (!open) {
    const count = formatNewEventsCount(summary.count);
    const description = describeNewEventsSummary(summary);
    return (
      <aside id="events-panel" className="events-panel folded" aria-label="Eventos recientes">
        <button
          type="button"
          className="events-tab"
          aria-expanded={false}
          aria-controls="events-panel"
          aria-label={
            description === ""
              ? "Desplegar eventos recientes"
              : `Desplegar eventos recientes: ${description}`
          }
          onClick={onToggle}
        >
          <span aria-hidden="true">◂</span>
          <span className="events-tab-title">Eventos</span>
          {count !== "" && (
            <span className="events-badge" aria-hidden="true">
              {count}
            </span>
          )}
          {summary.rejected && (
            <span className="events-mark" aria-hidden="true">
              ✗
            </span>
          )}
          {summary.alarm !== null && (
            <span className={`events-mark alarm-${summary.alarm}`} aria-hidden="true">
              {prioritySymbol(summary.alarm)}
            </span>
          )}
        </button>
      </aside>
    );
  }

  return (
    <aside id="events-panel" className="events-panel" aria-label="Eventos recientes">
      <header className="events-header">
        <h2>Eventos</h2>
        <button
          type="button"
          aria-expanded={true}
          aria-controls="events-panel"
          onClick={onToggle}
        >
          Plegar ▸
        </button>
      </header>
      <button type="button" className="link-button" onClick={onOpenSer}>
        Ver SER completo
      </button>
      <ul className="events-list" tabIndex={0} aria-label="Lista de eventos recientes">
        {rows.length === 0 ? (
          <li className="empty">Aún no hay eventos.</li>
        ) : (
          rows.map((row) => (
            <li key={row.id} className={itemClass(row)} title={row.tooltip}>
              <span className="event-head">
                <span className="event-time">{row.timestamp}</span>
                <span className="event-state">{row.state}</span>
              </span>
              <span className="event-description">{row.description}</span>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

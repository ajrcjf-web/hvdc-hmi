// El panel lateral de eventos: los últimos eventos del SER, del más reciente al más viejo,
// siempre visible en todas las ventanas. Solo muestra: los textos y el contador los
// preparan toEventRows y formatNewEventsCount.
// Plegado queda una pestaña angosta en el borde derecho, con el contador de eventos nuevos.
// Cada evento ocupa dos líneas: la hora arriba, en chico, y debajo descripción · estado,
// en una línea (si no cabe se corta con puntos suspensivos y el texto completo queda como
// tooltip). El panel tiene tamaño fijo: la llegada de un evento no mueve el contenido.
import { formatNewEventsCount, type EventRow } from "../eventRows.ts";

type Props = {
  open: boolean;
  rows: EventRow[];
  newCount: number; // eventos llegados desde que se plegó
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

export function EventsPanel({ open, rows, newCount, onToggle, onOpenSer }: Props) {
  if (!open) {
    const count = formatNewEventsCount(newCount);
    return (
      <aside id="events-panel" className="events-panel folded" aria-label="Eventos recientes">
        <button
          type="button"
          className="events-tab"
          aria-expanded={false}
          aria-controls="events-panel"
          aria-label={
            count === ""
              ? "Desplegar eventos recientes"
              : `Desplegar eventos recientes: ${count} nuevos`
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
              <span className="event-time">{row.timestamp}</span>
              <span className="event-text">{row.text}</span>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

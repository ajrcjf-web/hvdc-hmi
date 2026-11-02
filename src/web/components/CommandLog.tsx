// El resultado de cada orden: ejecutada, o rechazada con su motivo.
import { formatTime } from "../../labels.ts";
import type { LogEntry } from "../hmiState.ts";

type Props = {
  entries: LogEntry[];
};

export function CommandLog({ entries }: Props) {
  return (
    <section className="panel">
      <h2>Registro de órdenes</h2>
      {entries.length === 0 ? (
        <p className="empty">Aún no hay órdenes.</p>
      ) : (
        <ul className="log">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.reason === null ? "ok" : "rejected"}>
              <span className="time">[{formatTime(entry.timeSeconds)} s]</span>{" "}
              {entry.reason === null
                ? `✓ ${entry.label}`
                : `✗ ${entry.label} → rechazada: ${entry.reason}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

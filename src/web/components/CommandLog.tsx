// Todo lo que pasó con las órdenes: selección, ejecución, cancelación, expiración y rechazos con su motivo.
import { formatTime } from "../../labels.ts";
import { logText } from "../commandView.ts";
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
            <li key={entry.id} className={entry.reason === null ? undefined : "rejected"}>
              <span className="time">[{formatTime(entry.timeSeconds)} s]</span>{" "}
              {logText(entry)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

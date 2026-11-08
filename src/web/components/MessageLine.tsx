// La barra de mensajes: los últimos eventos del SER, del más reciente al más viejo, siempre
// visibles en todas las ventanas. Un clic en la barra abre la ventana del SER.
// Solo muestra: los textos los prepara toMessageRows.
// La altura es fija (3 filas, aunque haya menos eventos): nada se mueve al llegar uno nuevo.
// Cada fila ocupa una sola línea; si no cabe se corta con puntos suspensivos y el texto
// completo queda como tooltip (title).
import { MESSAGE_ROWS, type MessageRow } from "../messageRows.ts";

type Props = {
  rows: MessageRow[];
  onOpen: () => void; // abre la ventana del SER
};

function rowClass(row: MessageRow): string {
  const classes = ["message-row"];
  if (row.rejected) classes.push("rejected");
  if (row.alarm !== null) classes.push("message-alarm", `alarm-${row.alarm}`);
  if (row.active) classes.push("message-alarm-active");
  return classes.join(" ");
}

export function MessageLine({ rows, onOpen }: Props) {
  // Siempre MESSAGE_ROWS filas: las que faltan quedan vacías, para reservar la altura.
  const slots = Array.from({ length: MESSAGE_ROWS }, (_, i) => rows[i] ?? null);

  return (
    <button
      type="button"
      className="message-line"
      onClick={onOpen}
      aria-label="Últimos eventos del SER. Abrir la ventana de eventos"
    >
      {slots.map((row, i) =>
        row === null ? (
          <span key={`empty-${i}`} className="message-row empty">
            {i === 0 && rows.length === 0 ? "Aún no hay eventos." : " "}
          </span>
        ) : (
          <span key={row.id} className={rowClass(row)} title={row.tooltip}>
            <span className="time">{row.timestamp}</span> {row.text}
          </span>
        ),
      )}
    </button>
  );
}

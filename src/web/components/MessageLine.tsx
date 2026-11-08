// La línea de mensajes: la última respuesta del sistema a una orden, siempre visible
// en todas las ventanas. Solo muestra: el texto y la hora los prepara toMessageLine.
// Su altura es fija (dos líneas, también sin mensaje): nada se mueve al cambiar el mensaje.
// Si el texto no cabe en las dos líneas se corta con puntos suspensivos, y el texto
// completo queda como tooltip (title).
import type { MessageLine as MessageLineData } from "../commandView.ts";

type Props = {
  message: MessageLineData | null;
};

export function MessageLine({ message }: Props) {
  if (message === null) {
    return (
      <div className="message-line" role="status" aria-live="polite">
        <p className="message-text empty">Aún no hay respuestas.</p>
      </div>
    );
  }

  const full = `${message.timestamp} ${message.text}`;
  return (
    <div
      className={message.rejected ? "message-line rejected" : "message-line"}
      role="status"
      aria-live="polite"
    >
      <p className="message-text" title={full}>
        <span className="time">{message.timestamp}</span> {message.text}
      </p>
    </div>
  );
}

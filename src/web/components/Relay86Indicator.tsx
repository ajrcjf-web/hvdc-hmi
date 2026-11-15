// El estado del relé de bloqueo 86, siempre visible en la overview. Solo muestra.
// Se distingue por texto, símbolo y forma del borde (fino: normal, grueso: enclavado). El
// único color es el rojo de la alarma urgente que lo acompaña ("Relé 86 enclavado"): nunca
// es lo único que lo distingue.
//
// El tamaño es el mismo en los dos estados, para que nada se mueva cuando el 86 cambia: se
// dibujan las dos etiquetas una sobre la otra (la inactiva invisible), así la caja reserva
// el ancho de la más larga, y el borde mide siempre lo mismo (ver styles.css).
import { relay86Labels, type Relay86View } from "../relay86View.ts";

type Props = {
  relay: Relay86View;
};

const kinds = ["normal", "locked"] as const;

export function Relay86Indicator({ relay }: Props) {
  const active = relay.locked ? "locked" : "normal";
  return (
    <p
      className={`relay86-indicator ${relay.locked ? "relay86-locked" : "relay86-normal"}`}
      aria-label={relay.accessibleLabel}
    >
      {kinds.map((kind) => (
        <span
          key={kind}
          className={`relay86-text relay86-text-${kind}${kind === active ? "" : " relay86-text-hidden"}`}
          aria-hidden="true"
        >
          {relay86Labels[kind].symbol} {relay86Labels[kind].label}
        </span>
      ))}
    </p>
  );
}
